import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const dir = resolve(".output/tests");
await mkdir(dir, { recursive: true });
for (const name of ["core", "loader", "i18n"]) {
    await build({ entryPoints: [`${name}.ts`], outfile: `${dir}/${name}.mjs`, bundle: true, platform: "node", format: "esm" });
}
const { HOUR, expandEvents, layoutLanes, recurrenceId, snowflakeTime, dayWindow, timelineWindow, extendTimeline, shiftCalendarDays } = await import(pathToFileURL(`${dir}/core.mjs`).href);
const { EventLoader } = await import(pathToFileURL(`${dir}/loader.mjs`).href);
const { messages, languages, resolveLanguage, translator } = await import(pathToFileURL(`${dir}/i18n.mjs`).href);
const from = Date.parse("2026-10-06T00:00:00Z");
const to = from + 24 * HOUR;
const date = ms => new Date(ms).toISOString();
const event = (values = {}) => ({ id: "100", guild_id: "server", name: "Test", status: 1, scheduled_start_time: date(from + 18 * HOUR), scheduled_end_time: date(from + 20 * HOUR), recurrence_rule: null, guild_scheduled_event_exceptions: [], ...values });
const expand = (events, dates = () => []) => expandEvents(events, from, to, 2, dates);

test("settings safely initialize before plugin registration and use automatic or explicitly selected translations", async () => {
    const result = await build({
        entryPoints: ["settings.ts"], bundle: true, platform: "node", format: "esm", write: false,
        plugins: [{ name: "settings-test-shim", setup(builder) {
            builder.onResolve({ filter: /^@(api\/Settings|utils\/types|webpack\/common)$/ }, args => ({ path: args.path, namespace: "mock" }));
            builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path === "@api/Settings"
                ? 'export function definePluginSettings(def) {return {def, pluginName:"", store:{language:"auto"}, withPrivateSettings(){return this;}};}'
                : path === "@utils/types" ? 'export const OptionType={SELECT:1,BOOLEAN:2};' : 'export const LocaleStore={locale:"ja"};' }));
        } }]
    });
    const { settings } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    assert.equal(settings.def.language.description, "言語");
    settings.pluginName = "ServerEventsTimeline";
    assert.equal(settings.def.language.options[0].label, "Discordの言語");
    assert.equal(settings.def.defaultDuration.options[1].label, "2時間");
    settings.store.language = "en";
    assert.equal(settings.def.defaultDuration.description, messages.en.durationSetting);
    assert.equal(settings.def.refreshAutomatically.description, messages.en.refreshSetting);
});

test("automatic language follows Discord locales, with English fallback and persistent explicit preference", () => {
    for (const [locale, expected] of [["ru", "ru"], ["en-US", "en"], ["en-GB", "en"], ["ja", "ja"], ["es-ES", "es"], ["es-419", "es"], ["ko", "ko"], ["de", "en"]]) {
        assert.equal(resolveLanguage("auto", locale), expected);
        assert.equal(resolveLanguage("ja", locale), "ja");
    }
});

test("all five translations contain the same strings and interpolation variables", () => {
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const { value } of languages) {
        assert.deepEqual(Object.keys(messages[value]).sort(), Object.keys(messages.ru).sort());
        for (const [key, text] of Object.entries(messages[value])) {
            assert.ok(text.trim());
            assert.deepEqual(placeholders(text), placeholders(messages.ru[key]), `${value}.${key}`);
        }
        assert.ok(!translator(value).t("loadingServers", { done: 2, total: 6 }).includes("{"));
    }
    assert.equal(translator("ru").count(1, "events"), "1 событие");
    assert.equal(translator("ru").count(2, "events"), "2 события");
    assert.equal(translator("ru").count(11, "events"), "11 событий");
    assert.equal(translator("en").count(1, "guilds"), "1 server");
    assert.equal(translator("en").count(2, "guilds"), "2 servers");
});

test("cross-midnight events are clipped only visually; half-open boundaries exclude adjacent days", () => {
    const result = expand([event({ id: "night", scheduled_start_time: date(from - HOUR), scheduled_end_time: date(from + HOUR) }), event({ id: "past", scheduled_start_time: date(from - 2 * HOUR), scheduled_end_time: date(from) }), event({ id: "future", scheduled_start_time: date(to), scheduled_end_time: date(to + HOUR) })]);
    assert.equal(result.length, 1);
    assert.equal(result[0].start, from - HOUR);
    const lane = layoutLanes(result, from, to, 100).items[0];
    assert.equal(lane.left, 0);
    assert.equal(lane.width, 97);
});

test("canceled/completed, malformed and duplicate events do not enter the timeline", () => {
    const result = expand([event(), event(), event({ id: "cancel", status: 4 }), event({ id: "done", status: 3 }), event({ id: "bad", scheduled_start_time: "invalid" })]);
    assert.equal(result.length, 1);
});

test("an unspecified end is visibly estimated; explicit event ends stay exact", () => {
    const [first, second] = expand([event({ id: "a" }), event({ id: "b", scheduled_end_time: null })]);
    assert.equal(first.estimatedEnd, false);
    assert.equal(second.estimatedEnd, true);
    assert.equal(second.end - second.start, 2 * HOUR);
});

test("recurrence cancellation, moved start, custom end and moved-in occurrence", () => {
    const t1 = from + 10 * HOUR;
    const t2 = from + 12 * HOUR;
    const outside = to + 10 * HOUR;
    const result = expand([event({ recurrence_rule: { start: date(from), frequency: 3 }, guild_scheduled_event_exceptions: [
        { event_exception_id: recurrenceId(t1), is_canceled: true },
        { event_exception_id: recurrenceId(t2), scheduled_start_time: date(from + 15 * HOUR), scheduled_end_time: date(from + 19 * HOUR) },
        { event_exception_id: recurrenceId(outside), scheduled_start_time: date(from + 21 * HOUR) }
    ] })], () => [new Date(t1), new Date(t2)]);
    assert.equal(result.length, 2);
    assert.equal(result[0].start, from + 15 * HOUR);
    assert.equal(result[0].end, from + 19 * HOUR);
    assert.equal(result[1].start, from + 21 * HOUR);
    assert.equal(result[1].end, from + 23 * HOUR);
    assert.equal(result[1].recurrenceId, recurrenceId(outside));
});

test("only the active recurrence is marked live", () => {
    const result = expand([event({ status: 2, recurrence_rule: { start: date(from) } })], () => [new Date(from + 18 * HOUR), new Date(from + 21 * HOUR)]);
    assert.deepEqual(result.map(o => o.active), [true, false]);
});

test("short overlapping blocks get separate lanes; adjacent events reuse lanes", () => {
    const events = expand([event({ id: "a", scheduled_start_time: date(from), scheduled_end_time: date(from + HOUR / 60) }), event({ id: "b", scheduled_start_time: date(from + HOUR / 30), scheduled_end_time: date(from + HOUR / 20) }), event({ id: "c", scheduled_start_time: date(from + HOUR), scheduled_end_time: date(from + 2 * HOUR) })]);
    const layout = layoutLanes(events, from, to, 100);
    assert.deepEqual(layout.items.map(i => i.lane), [0, 1, 0]);
    assert.equal(layout.lanes, 2);
});

test("events from different servers share compact lanes when their time ranges do not overlap", () => {
    const events = expand([
        event({ id: "a", guild_id: "one", scheduled_start_time: date(from + HOUR), scheduled_end_time: date(from + 2 * HOUR) }),
        event({ id: "b", guild_id: "two", scheduled_start_time: date(from + 2 * HOUR), scheduled_end_time: date(from + 3 * HOUR) }),
        event({ id: "c", guild_id: "three", scheduled_start_time: date(from + 2.5 * HOUR), scheduled_end_time: date(from + 4 * HOUR) }),
        event({ id: "d", guild_id: "four", scheduled_start_time: date(from + 4 * HOUR), scheduled_end_time: date(from + 5 * HOUR) })
    ]);
    const layout = layoutLanes(events, from, to, 100);
    assert.equal(layout.lanes, 2);
    assert.deepEqual(layout.items.map(i => i.lane), [0, 0, 1, 0]);
});

test("snowflake occurrence ids round trip without numeric precision loss", () => {
    assert.equal(snowflakeTime(recurrenceId(from)), from);
    assert.ok(Number.isNaN(snowflakeTime("broken")));
});

test("local calendar day windows follow DST transitions", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/New_York";
    const spring = dayWindow("2026-03-08", 1);
    const fall = dayWindow("2026-11-01", 1);
    assert.equal((spring[1] - spring[0]) / HOUR, 23);
    assert.equal((fall[1] - fall[0]) / HOUR, 25);
    if (previous == null) delete process.env.TZ; else process.env.TZ = previous;
});

test("infinite timeline rebases in both directions with a bounded range and the same visible timestamp", () => {
    for (const direction of [-1, 1]) {
        let [start, end] = timelineWindow(from);
        assert.equal(extendTimeline(start, end, from, from + 12 * HOUR), null);
        for (let i = 0; i < 100; i++) {
            const left = direction < 0 ? start + HOUR : end - 12 * HOUR;
            const next = extendTimeline(start, end, left, left + 10 * HOUR);
            assert.ok(next);
            assert.equal(next[1], shiftCalendarDays(next[0], 21));
            const offset = (left - next[0]) / HOUR * 140;
            assert.equal(next[0] + offset / 140 * HOUR, left);
            assert.ok(offset > 0 && offset + 1400 < (next[1] - next[0]) / HOUR * 140);
            assert.ok(direction < 0 ? next[0] < start : next[0] > start);
            [start, end] = next;
        }
    }
});

test("window navigation across DST keeps local midnights and preserves absolute scroll time", () => {
    const previous = process.env.TZ;
    try {
        process.env.TZ = "America/New_York";
        for (const date of ["2026-03-08", "2026-11-01"]) {
            const midnight = dayWindow(date, 1)[0];
            const [start, end] = timelineWindow(midnight + 5 * HOUR);
            assert.equal(new Date(start).getHours(), 0);
            assert.equal(new Date(end).getHours(), 0);
            assert.equal(new Date(shiftCalendarDays(midnight, 1)).getHours(), 0);
            const left = end - 12 * HOUR;
            const [next] = extendTimeline(start, end, left, left + 10 * HOUR);
            assert.equal(next + ((left - next) / HOUR * 60) / 60 * HOUR, left);
        }
    } finally {
        if (previous == null) delete process.env.TZ; else process.env.TZ = previous;
    }
});

test("loader shares an in-flight request, continues after errors and only retries uncached failures", async () => {
    const calls = [];
    let inFlight = 0;
    let maximum = 0;
    const loader = new EventLoader(async id => {
        calls.push(id);
        maximum = Math.max(maximum, ++inFlight);
        await new Promise(resolve => setTimeout(resolve, 2));
        inFlight--;
        if (id === "b") throw new Error("Forbidden");
    }, () => true, 0);
    const first = loader.refresh(["a", "b", "a", "c"]);
    assert.equal(first, loader.refresh(["a", "b", "c"]));
    await first;
    assert.deepEqual(calls, ["a", "b", "c"]);
    assert.deepEqual(loader.state.errors, ["b"]);
    assert.equal(maximum, 1);
    assert.equal(loader.state.done, 3);
    await loader.refresh(["a", "b", "c"]);
    assert.deepEqual(calls, ["a", "b", "c", "b"]);
});

test("cancel stops the old queue, and a new session can refresh after the old in-flight request", async () => {
    const calls = [];
    let release;
    const loader = new EventLoader(async id => {
        calls.push(id);
        if (id === "old") await new Promise(resolve => { release = resolve; });
    }, () => true, 0);
    const old = loader.refresh(["old", "never"]);
    loader.cancel();
    const next = loader.refresh(["new"]);
    release();
    await Promise.all([old, next]);
    assert.deepEqual(calls, ["old", "new"]);
    assert.equal(loader.state.loading, false);
    assert.equal(loader.state.done, 1);
});

test("disabled or switched-account sessions stop issuing requests", async () => {
    let valid = true;
    const calls = [];
    const loader = new EventLoader(async id => { calls.push(id); valid = false; }, () => valid, 0);
    await loader.refresh(["a", "b"]);
    await loader.refresh(["c"]);
    assert.deepEqual(calls, ["a"]);
});
