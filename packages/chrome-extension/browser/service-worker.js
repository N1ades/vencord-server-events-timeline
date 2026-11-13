/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

chrome.action.onClicked.addListener(async clickedTab => {
    const tabs = await chrome.tabs.query({
        url: ["https://*.discord.com/channels/*", "https://*.discord.com/app"]
    });
    const discordTab = tabs.find(tab => tab.id === clickedTab.id)
        ?? tabs.find(tab => tab.windowId === clickedTab.windowId)
        ?? tabs[0];

    if (discordTab?.id != null) {
        const opened = await chrome.tabs.sendMessage(
            discordTab.id,
            { action: "openEventsTimeline" },
            { frameId: 0 }
        ).catch(() => false);

        if (opened) {
            await chrome.tabs.update(discordTab.id, { active: true });
            if (discordTab.windowId !== clickedTab.windowId) {
                await chrome.windows.update(discordTab.windowId, { focused: true });
            }
            return;
        }
    }

    await chrome.tabs.create({ url: "https://discord.com/app#server-events-timeline" });
});

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { command });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openShortcuts") {
    chrome.tabs.create({ url: "about://extensions/shortcuts" });
  }
});

const timelineAlarm = "timelinePublish";
const timelineEndpoint = "https://tl.nyades.dev/timeline";
const publicationConcurrency = 6;
const snowflake = /^\d{16,22}$/;
const discordId = /^discord-(\d{16,22})(?:-(\d{16,22}))?$/;
let storageQueue = Promise.resolve();
let publishing;
let publishAgain = false;

function withQueue(task) {
    const next = storageQueue.then(task, task);
    storageQueue = next.catch(() => {});
    return next;
}

function allowed(config, guild) {
    return config.all || config.guilds?.includes(guild);
}

function boundedText(value, max) {
    return typeof value === "string" ? Array.from(value).slice(0, max).join("") : "";
}

function publication(entry) {
    const id = typeof entry?.id === "string" && discordId.exec(entry.id);
    if (!id || !snowflake.test(entry.guild)) return;
    if (entry.action === "cancel") {
        return { action: "cancel", id: entry.id, guild: entry.guild, ...(entry.series === "1" && !id[2] ? { series: "1" } : {}) };
    }
    if (entry.action !== "upsert" || !entry.title || !Number.isFinite(Date.parse(entry.start))) return;
    const link = "https://discord.com/events/" + entry.guild + "/" + id[1] + (id[2] ? "?event_exception_id=" + id[2] : "");
    return {
        action: "upsert", id: entry.id, guild: entry.guild,
        title: boundedText(entry.title, 200), start: boundedText(entry.start, 40), end: boundedText(entry.end, 40),
        desc: boundedText(entry.desc, 1000), location: boundedText(entry.location, 200),
        group: boundedText(entry.group, 100), url: link, status: ["active", "completed"].includes(entry.status) ? entry.status : "scheduled",
        ...(typeof entry.guildIcon === "string" ? { guild_icon: entry.guildIcon } : {}),
        ...(typeof entry.recurrence === "string" ? { recurrence: entry.recurrence } : {})
    };
}

async function enqueue(message) {
    await withQueue(async () => {
        const { timelineConfig = {}, timelinePending = {}, timelineSent = {} } = await chrome.storage.local.get([
            "timelineConfig", "timelinePending", "timelineSent"
        ]);
        const guilds = message.guilds.filter(guild => snowflake.test(guild?.id) && typeof guild.name === "string")
            .slice(0, 500).map(({ id, name }) => ({ id, name: boundedText(name, 100) }));
        await chrome.storage.local.set({ timelineGuilds: guilds });
        if (!timelineConfig.token) return;
        const selected = new Set(guilds.filter(guild => allowed(timelineConfig, guild.id)).map(guild => guild.id));
        for (const raw of message.entries.slice(0, 10_000)) {
            const entry = publication(raw);
            if (!entry || !selected.has(entry.guild)) continue;
            if (entry.recurrence !== undefined || entry.series === "1") {
                for (const id of Object.keys(timelinePending)) {
                    if (id.startsWith(entry.id + "-")) delete timelinePending[id];
                }
            }
            const body = JSON.stringify(entry);
            if (!publishing && timelineSent[entry.id]?.body === body) delete timelinePending[entry.id];
            else timelinePending[entry.id] = body;
        }
        await chrome.storage.local.set({ timelinePending });
    });
    await drain();
}

async function sendPublication(body, token) {
    const { guild, ...fields } = JSON.parse(body);
    const url = new URL(timelineEndpoint);
    const { desc, ...query } = fields;
    url.search = new URLSearchParams({ ...query, token });
    if (typeof desc === "string") {
        const bytes = new TextEncoder().encode(desc);
        url.searchParams.set("desc_b64", btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    }
    try {
        const response = await fetch(url, {
            method: "GET", cache: "no-store",
            credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(7000)
        });
        if (response.status === 401 || response.status === 429 || response.status >= 500) return "retry";
        if (response.status === 403 && !response.headers.get("content-type")?.includes("application/json")) return "rejected";
        const result = await response.json();
        if (result.ok || (result.error === "event_not_found" && fields.action === "cancel")) return "ok";
        return "rejected";
    } catch { return "retry"; }
}

function drain() {
    if (publishing) {
        publishAgain = true;
        return publishing;
    }
    publishing = (async () => {
        do {
            publishAgain = false;
            if (await drainQueue()) break;
        } while (publishAgain);
    })().finally(() => { publishing = undefined; });
    return publishing;
}

async function drainQueue() {
    const { timelineConfig = {}, timelinePending = {} } = await chrome.storage.local.get(["timelineConfig", "timelinePending"]);
    if (!timelineConfig.token) {
        await chrome.alarms.clear(timelineAlarm);
        return;
    }
    const now = Date.now();
    const pending = Object.entries(timelinePending).map(([id, body]) => {
        const { action, guild, start, end } = JSON.parse(body);
        const from = Date.parse(start);
        const to = Date.parse(end) || from + 7_200_000;
        const distance = action === "cancel" ? -1 : Math.max(0, from - now, now - to);
        return { id, body, guild, distance };
    }).filter(entry => allowed(timelineConfig, entry.guild)).sort((a, b) => a.distance - b.distance);
    if (!pending.length) {
        await chrome.alarms.clear(timelineAlarm);
        return;
    }
    await chrome.alarms.create(timelineAlarm, { delayInMinutes: 2 });
    const results = [];
    for (let offset = 0; offset < pending.length; offset += publicationConcurrency) {
        const batch = pending.slice(offset, offset + publicationConcurrency);
        const current = (await chrome.storage.local.get("timelineConfig")).timelineConfig;
        if (current?.token !== timelineConfig.token) break;
        const outcomes = await Promise.all(batch.map(({ body, guild }) => allowed(current, guild)
            ? sendPublication(body, current.token) : "skipped"));
        results.push(...batch.map(({ id, body }, index) => ({ id, body, result: outcomes[index] })));
        if (outcomes.includes("retry")) break;
        if ((offset + publicationConcurrency) % 60 === 0) {
            await chrome.alarms.create(timelineAlarm, { delayInMinutes: 2 });
        }
    }
    await withQueue(async () => {
        const { timelinePending = {}, timelineSent = {} } = await chrome.storage.local.get(["timelinePending", "timelineSent"]);
        const { timelineConfig: config = {} } = await chrome.storage.local.get("timelineConfig");
        const now = Date.now();
        for (const { id, body, result } of results) {
            if (result === "retry" || result === "skipped") continue;
            if (timelinePending[id] === body) delete timelinePending[id];
            if (result === "ok" && timelineConfig.token === config.token) timelineSent[id] = { body, at: now };
        }
        const sent = Object.fromEntries(Object.entries(timelineSent)
            .filter(([, entry]) => now - entry.at < 7 * 86_400_000)
            .sort(([, a], [, b]) => b.at - a.at).slice(0, 5000));
        await chrome.storage.local.set({
            timelinePending, timelineSent: sent,
            timelineResult: {
                pending: Object.keys(timelinePending).length,
                sent: results.filter(row => row.result === "ok").length,
                failed: results.filter(row => row.result === "rejected").length,
                retry: results.some(row => row.result === "retry"),
                at: now
            }
        });
    });
    const retry = results.some(row => row.result === "retry");
    if (!retry && results.length === pending.length) await chrome.alarms.clear(timelineAlarm);
    return retry;
}

chrome.alarms.onAlarm.addListener(({ name }) => { if (name === timelineAlarm) void drain().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => void drain().catch(() => {}));
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.timelineConfig) return;
    void withQueue(async () => {
        const config = changes.timelineConfig.newValue ?? {};
        const { timelinePending = {} } = await chrome.storage.local.get("timelinePending");
        for (const [id, body] of Object.entries(timelinePending)) {
            if (!config.token || !allowed(config, JSON.parse(body).guild)) delete timelinePending[id];
        }
        await chrome.storage.local.set({ timelinePending,
            ...(config.token !== changes.timelineConfig.oldValue?.token ? { timelineSent: {} } : {}) });
    }).then(drain).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !/^https:\/\/(?:[\w-]+\.)?discord\.com\//.test(sender.url ?? "")) return;
    if (message.action === "timelineOptions") void chrome.runtime.openOptionsPage().catch(() => {});
    if (message.action === "timelinePublish" && Array.isArray(message.guilds) && Array.isArray(message.entries)) {
        void enqueue(message).catch(() => {});
    }
});
