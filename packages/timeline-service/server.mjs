import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const origin = process.env.TIMELINE_ORIGIN ?? "https://tl.nyades.dev";
const token = process.env.TIMELINE_TOKEN;
const discordToken = process.env.TIMELINE_DISCORD_TOKEN;
if (!token || token.length < 32 || !discordToken || discordToken.length < 32 || token === discordToken) {
    throw new Error("Configure two distinct timeline write tokens of at least 32 characters");
}
const data = process.env.TIMELINE_DATA ?? "./data";
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(resolve(data, "timeline.sqlite"));
db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, start TEXT NOT NULL, url TEXT,
        updated_at TEXT NOT NULL, payload TEXT NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS event_source_date ON events(url, start) WHERE url IS NOT NULL;
    CREATE INDEX IF NOT EXISTS event_start ON events(start);
    CREATE INDEX IF NOT EXISTS event_updated ON events(updated_at);
`);

const find = db.prepare("SELECT payload FROM events WHERE id = ?");
const findDuplicate = db.prepare("SELECT payload FROM events WHERE url = ? AND start = ?");
const all = db.prepare("SELECT payload FROM events ORDER BY start, id");
const latest = db.prepare("SELECT payload FROM events ORDER BY updated_at DESC, id LIMIT ?");
const save = db.prepare(`INSERT INTO events VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET start=excluded.start, url=excluded.url, updated_at=excluded.updated_at, payload=excluded.payload`);
const series = db.prepare("SELECT payload FROM events WHERE id GLOB ?");
const remove = db.prepare("DELETE FROM events WHERE id = ?");
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const digest = value => createHash("sha256").update(value).digest();
const adminDigest = digest(token);
const discordDigest = digest(discordToken);
const fieldLimits = { title: 200, desc: 1000, location: 200, source: 80, group: 100 };
const priorities = new Set(["low", "normal", "high", "rare"]);
const actions = new Set(["add", "update", "upsert", "cancel", "delete", "touch"]);
const moscow = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset"
});

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const bad = code => { throw new HttpError(400, code); };
const conflict = code => { throw new HttpError(409, code); };
const missing = () => { throw new HttpError(404, "event_not_found"); };
const parse = row => row && JSON.parse(row.payload);
const eventUrl = id => new URL("/e/" + id, origin).href;

function dateFields(key, value) {
    if (key === "end" && !value) return { end: null, end_original: null, end_msk: null };
    let milliseconds;
    if (/^-?\d{1,13}$/.test(value)) {
        milliseconds = Number(value) * (value.replace("-", "").length <= 10 ? 1000 : 1);
    } else {
        const iso = /^(\d{4})-(\d\d)-(\d\d)T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(value);
        if (!iso || !Number.isFinite(Date.parse(value))) bad("invalid_" + key);
        const day = new Date(iso[1] + "-" + iso[2] + "-01T00:00:00Z");
        day.setUTCDate(Number(iso[3]));
        if (day.getUTCDate() !== Number(iso[3]) || day.getUTCMonth() + 1 !== Number(iso[2])) bad("invalid_" + key);
        milliseconds = Date.parse(value);
    }
    const date = new Date(milliseconds);
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) bad("invalid_" + key);
    const parts = Object.fromEntries(moscow.formatToParts(date).map(p => [p.type, p.value]));
    return { [key]: date.toISOString(), [key + "_original"]: value,
        [key + "_msk"]: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${parts.timeZoneName.slice(3)}` };
}

function normalizeUrl(value) {
    if (!value) return null;
    let url;
    try { url = new URL(value); } catch { bad("invalid_url"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || value.length > 1000) bad("invalid_url");
    url.hash = "";
    if (["discord.com", "discordapp.com", "www.discord.com", "www.discordapp.com"].includes(url.hostname) && /^\/events\/\d+\/\d+\/?$/.test(url.pathname)) {
        url.protocol = "https:";
        url.hostname = "discord.com";
        url.pathname = url.pathname.replace(/\/$/, "");
        for (const key of [...url.searchParams.keys()]) if (key !== "event_exception_id") url.searchParams.delete(key);
    }
    if (["twitter.com", "www.twitter.com", "www.x.com", "mobile.twitter.com"].includes(url.hostname)) url.hostname = "x.com";
    if (url.hostname === "x.com" && /\/status\/\d+/.test(url.pathname)) url.search = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
}

function parseRecurrence(raw, previous, id) {
    if (!/^discord-\d+$/.test(id) || raw.length > 12000) bad("invalid_recurrence");
    let value;
    try { value = JSON.parse(raw); } catch { bad("invalid_recurrence"); }
    if (value === null) return previous?.history?.length ? { rule: null, exceptions: [], history: previous.history } : null;
    const rule = value?.rule;
    if (!rule || !Number.isFinite(Date.parse(rule.start)) || !Number.isInteger(rule.frequency) || rule.frequency < 0 || rule.frequency > 3 ||
        !Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 365 ||
        (rule.end != null && !Number.isFinite(Date.parse(rule.end))) ||
        (rule.count != null && (!Number.isInteger(rule.count) || rule.count < 1)) || !Array.isArray(value.exceptions) || value.exceptions.length > 500 ||
        !Array.isArray(value.history) || value.history.length > 100) bad("invalid_recurrence");
    for (const key of ["byWeekday", "by_weekday", "byMonth", "by_month", "byMonthDay", "by_month_day", "byYearDay", "by_year_day"]) {
        if (rule[key] != null && (!Array.isArray(rule[key]) || rule[key].length > 366 || !rule[key].every(Number.isInteger))) bad("invalid_recurrence");
    }
    for (const key of ["byNWeekday", "by_n_weekday"]) {
        if (rule[key] != null && (!Array.isArray(rule[key]) || rule[key].length > 35 || rule[key].some(day =>
            !Number.isInteger(day?.day) || day.day < 0 || day.day > 6 || !Number.isInteger(day.n) || !day.n || Math.abs(day.n) > 53))) bad("invalid_recurrence");
    }
    for (const exception of value.exceptions) {
        if (!/^\d{16,22}$/.test(exception?.event_exception_id) ||
            [exception.scheduled_start_time, exception.scheduled_end_time].some(date => date != null && !Number.isFinite(Date.parse(date)))) bad("invalid_recurrence");
    }
    const history = new Map((previous?.history ?? []).map(item => [item.id, item]));
    const now = Date.now();
    for (const item of value.history) {
        if (!/^\d{16,22}$/.test(item?.id) || !Number.isFinite(item.start) || !Number.isFinite(item.end) ||
            item.start >= item.end || item.end > now + 60_000) bad("invalid_recurrence");
        if (!history.has(item.id)) history.set(item.id, { id: item.id, start: item.start, end: item.end, estimatedEnd: Boolean(item.estimatedEnd) });
    }
    return { rule, exceptions: value.exceptions, history: [...history.values()].sort((a, b) => a.start - b.start) };
}

function mutation(params) {
    if (params.getAll("token").length > 1) bad("duplicate_parameter");
    const signature = digest(params.get("token") ?? "");
    const discord = timingSafeEqual(signature, discordDigest);
    if (!discord && !timingSafeEqual(signature, adminDigest)) throw new HttpError(401, "unauthorized");
    for (const key of params.keys()) if (params.getAll(key).length > 1) bad("duplicate_parameter");
    const action = params.get("action") ?? "upsert";
    const id = params.get("id");
    const dryRun = params.get("dry_run") === "1";
    if (!actions.has(action)) bad("invalid_action");
    if (!id) bad("missing_id");
    if (!idPattern.test(id)) bad("invalid_id");
    if (discord && (!/^discord-\d+(?:-\d+)?$/.test(id) || !["upsert", "cancel"].includes(action))) {
        throw new HttpError(403, "action_forbidden");
    }
    if (params.get("series") === "1") {
        if (action !== "cancel" || !/^discord-\d+$/.test(id)) bad("invalid_series");
        const start = new Date().toISOString();
        const occurrences = [find.get(id), ...series.all(id + "-*")].filter(Boolean).map(parse)
            .filter(event => event.status !== "cancelled" && (event.recurrence?.rule || event.start >= start || event.end >= start));
        if (!dryRun) {
            db.exec("BEGIN IMMEDIATE");
            try {
                for (const event of occurrences) {
                    event.status = "cancelled";
                    event.updated_at = start;
                    save.run(event.id, event.start, event.url ?? null, start, JSON.stringify(event));
                }
                db.exec("COMMIT");
            } catch (error) { db.exec("ROLLBACK"); throw error; }
        }
        return { ok: true, action, id, status: occurrences.length ? "cancelled" : "unchanged",
            count: occurrences.length, ...(dryRun && { dry_run: true }) };
    }
    let previous = parse(find.get(id));
    if (action === "add" && previous) conflict("already_exists");
    if (!previous && !["upsert", "add"].includes(action)) missing();

    let event = { ...previous, id };
    let status = action === "cancel" ? "cancelled" : action === "delete" ? "deleted" : "touched";
    if (["add", "update", "upsert"].includes(action)) {
        const patch = {};
        for (const [key, limit] of Object.entries(fieldLimits)) {
            if (params.has(key)) patch[key] = Array.from(params.get(key).trim()).slice(0, limit).join("");
        }
        if (params.has("desc_b64")) {
            const encoded = params.get("desc_b64");
            if (!/^[A-Za-z0-9_-]{0,5334}$/.test(encoded) || params.has("desc")) bad("invalid_desc");
            try {
                const bytes = Buffer.from(encoded, "base64url");
                if (bytes.toString("base64url") !== encoded) bad("invalid_desc");
                const desc = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                patch.desc = Array.from(desc.trim()).slice(0, fieldLimits.desc).join("");
            } catch { bad("invalid_desc"); }
        }
        if (params.has("guild_icon")) {
            const icon = params.get("guild_icon");
            if (!/^discord-\d+$/.test(id) || (icon && !/^(?:a_)?[a-f0-9]{32}$/.test(icon))) bad("invalid_guild_icon");
            patch.guild_icon = icon || null;
        }
        for (const key of ["start", "end"]) if (params.has(key)) Object.assign(patch, dateFields(key, params.get(key).trim()));
        if (params.has("url")) patch.url = normalizeUrl(params.get("url").trim());
        if (params.has("tags")) {
            const value = params.get("tags");
            if (value.length > 400) bad("tags_too_long");
            patch.tags = [...new Set(value.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean))];
        }
        if (params.has("priority")) {
            if (!priorities.has(params.get("priority"))) bad("invalid_priority");
            patch.priority = params.get("priority");
        }
        if (params.has("status")) {
            const value = params.get("status");
            if (!["scheduled", "active", "cancelled", "completed"].includes(value)) bad("invalid_status");
            patch.status = value;
        }
        if (discord) {
            patch.source = "discord";
            if (patch.url && !/^https:\/\/discord\.com\/events\/\d+\/\d+(?:\?event_exception_id=\d+)?$/.test(patch.url)) bad("invalid_discord_url");
        }
        if (params.has("recurrence")) patch.recurrence = parseRecurrence(params.get("recurrence"), previous?.recurrence, id);
        const duplicate = parse(findDuplicate.get(
            Object.hasOwn(patch, "url") ? patch.url : previous?.url ?? null,
            patch.start ?? previous?.start ?? null
        ));
        if (duplicate && duplicate.id !== id) {
            if (previous || action !== "upsert" || (discord && !duplicate.id.startsWith("discord-"))) conflict("duplicate_source_event");
            previous = duplicate;
        }
        event = { status: "scheduled", priority: "normal", source: "manual", tags: [], ...previous, ...patch, id: previous?.id ?? id };
        if (!event.title) bad("missing_title");
        if (!event.start) bad("missing_start");
        if (event.end && event.end <= event.start) bad("end_before_start");
        status = previous ? "updated" : "created";
        if (previous && Object.keys(patch).every(key => JSON.stringify(patch[key]) === JSON.stringify(previous[key]))) status = "unchanged";
    }
    if (action === "cancel") {
        if (event.status === "cancelled") status = "unchanged";
        event.status = "cancelled";
    }
    const parentId = /^discord-\d+-\d+$/.test(id) ? id.slice(0, id.lastIndexOf("-")) : null;
    if (parentId && ["add", "upsert"].includes(action) && parse(find.get(parentId))?.recurrence?.rule) conflict("series_managed");
    if (!dryRun && status !== "unchanged") {
        if (action === "delete") remove.run(id);
        else {
            event.updated_at = new Date().toISOString();
            event.created_at ??= event.updated_at;
            if (event.recurrence?.rule && /^discord-\d+$/.test(event.id)) {
                db.exec("BEGIN IMMEDIATE");
                try {
                    const archived = new Map(event.recurrence.history.map(item => [item.id, item]));
                    for (const row of series.all(event.id + "-*")) {
                        const legacy = parse(row);
                        const start = Date.parse(legacy.start);
                        const end = legacy.end ? Date.parse(legacy.end) : start + 7_200_000;
                        const occurrence = legacy.id.slice(event.id.length + 1);
                        if (legacy.status !== "cancelled" && end <= Date.now() && !archived.has(occurrence)) {
                            archived.set(occurrence, { id: occurrence, start, end, estimatedEnd: !legacy.end });
                        }
                        remove.run(legacy.id);
                    }
                    event.recurrence.history = [...archived.values()].sort((a, b) => a.start - b.start);
                    save.run(event.id, event.start, event.url ?? null, event.updated_at, JSON.stringify(event));
                    db.exec("COMMIT");
                } catch (error) { db.exec("ROLLBACK"); throw error; }
                return { ok: true, action, id: event.id, status, url: eventUrl(event.id) };
            }
            save.run(event.id, event.start, event.url ?? null, event.updated_at, JSON.stringify(event));
        }
    }
    return { ok: true, action, id: event.id, status, url: eventUrl(event.id), ...(dryRun && { dry_run: true }) };
}

const assets = new Map([
    ["/", [readFileSync(new URL("./index.html", import.meta.url)), "text/html"]],
    ["/site.js", [readFileSync(new URL("./site.js", import.meta.url)), "text/javascript"]],
    ["/site.css", [readFileSync(new URL("./site.css", import.meta.url)), "text/css"]]
]);
function send(response, status, data, mime = "application/json") {
    response.writeHead(status, { "Content-Type": mime + "; charset=utf-8" });
    response.end(mime === "application/json" ? JSON.stringify(data) : data);
}
createServer({ maxHeaderSize: 24_576, requestTimeout: 15_000 }, (request, response) => {
    response.setHeader("Cache-Control", "no-store, private");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
        if (request.url.length > 16_384) throw new HttpError(414, "url_too_long");
        const { pathname, searchParams } = new URL(request.url, origin);
        if (request.method !== "GET" && !(request.method === "HEAD" && pathname !== "/timeline")) {
            response.setHeader("Allow", pathname === "/timeline" ? "GET" : "GET, HEAD");
            throw new HttpError(405, "method_not_allowed");
        }
        if (pathname === "/timeline") return send(response, 200, mutation(searchParams));
        if (pathname === "/healthz") { db.prepare("SELECT 1").get(); return send(response, 200, { ok: true }); }
        if (pathname === "/timeline/feed") return send(response, 200, { ok: true, events: all.all().map(parse) });
        if (pathname === "/timeline/latest") {
            const limit = searchParams.get("limit") ?? "25";
            if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) bad("invalid_limit");
            return send(response, 200, { ok: true, events: latest.all(Number(limit)).map(parse) });
        }
        const match = /^\/(api\/)?e\/([^/]+)$/.exec(pathname);
        if (match) {
            if (!idPattern.test(match[2])) missing();
            const event = parse(find.get(match[2]));
            if (!event) missing();
            if (match[1]) return send(response, 200, { ok: true, event });
        }
        const asset = assets.get(match ? "/" : pathname);
        if (asset) return send(response, 200, ...asset);
        return send(response, 404, { ok: false, error: "not_found" });
    } catch (error) {
        if (!(error instanceof HttpError)) console.error("Timeline request failed", error.code ?? error.name);
        send(response, error.status ?? 500, { ok: false, error: error.status ? error.message : "internal_error" });
    }
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0", () => console.log("Timeline HTTP server ready"));
