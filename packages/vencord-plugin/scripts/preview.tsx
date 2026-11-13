/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState } from "@webpack/common";
import * as React from "react";
import { createRoot } from "react-dom/client";

import { HOUR, localDate } from "../core";
import type { Language } from "../i18n";
import { Timeline } from "../Timeline";
import type { Guild, GuildScheduledEvent } from "@vencord/discord-types";

import { recurrenceDates } from "./recurrence.mjs";
import { CalendarFocus, editPersonal, PersonalEvent, personalId, removePersonal, savePersonal, validMinutes } from "../personal";
import { TimestampBadge } from "../TimestampBadge";

const midnight = new Date(`${localDate(new Date())}T00:00:00`).getTime();
const guilds = [
    { id: "201", name: "Neon District", icon: null },
    { id: "202", name: "VRChat RU", icon: null },
    { id: "203", name: "Afterhours", icon: null },
    { id: "204", name: "Creative Space", icon: null },
    { id: "205", name: "Furry Community", icon: null },
    { id: "206", name: "Quiet Corner", icon: null }
] as Guild[];
const currentHour = new Date().getHours();
const slot = Math.max(2, Math.min(17, currentHour - 1));
const fixtures = [
    ["201", "MIDWEEK / Drum & Bass", slot, 4, "VRChat · Neon rooftop", 2],
    ["201", "Open decks: newcomers", slot + 2, 2, "VRChat · Second stage", 1],
    ["202", "Community meetup", slot + 1, 3, "Voice channel", 1],
    ["203", "AFTER DARK — Techno Session", slot + 3, 5, "VRChat · Warehouse", 1],
    ["204", "Draw together / Art jam", slot - 1, 2, "Creative workshop", 1],
    ["205", "Community hangout", slot + 5, null, "VRChat · Cozy world", 1],
    ["202", "Movie night: autumn picks", 23, 3, "Cinema", 1],
    ["204", "A very long title for a short event to test clipping", slot + 4.5, .25, "Workshop", 1],
    ["206", "Community marathon · 3 days", -24, 72, "Community marathon", 1],
    ["202", "Meetup in two weeks", 14 * 24 + 18, 3, "Community", 1],
    ["204", "Last month's meetup", -28 * 24 + 18, 2, "Workshop", 1]
];
const events = fixtures.map(([guild, name, hour, duration, location, status], index) => ({
    id: String(index + 300), guild_id: guild, name, status, entity_type: 3, channel_id: null,
    scheduled_start_time: new Date(midnight + Number(hour) * HOUR).toISOString(),
    scheduled_end_time: duration == null ? null : new Date(midnight + (Number(hour) + Number(duration)) * HOUR).toISOString(),
    description: "Synthetic preview event.\n\nIn Discord, the organizer's description and meeting details appear here.",
    entity_metadata: { location }, image: null, recurrence_rule: null, guild_scheduled_event_exceptions: []
})) as GuildScheduledEvent[];

// API-format rules exercise the same store-to-RRULE conversion as the installed plugin.
const weeklyStart = new Date(midnight - 14 * 24 * HOUR + slot * HOUR).toISOString();
const weekday = (new Date(midnight + slot * HOUR).getUTCDay() + 6) % 7;
for (let index = 0; index < 3; index++) {
    events.push({ ...events[0], id: String(400 + index), guild_id: "206", status: 1,
        name: ["Weekly community meetup", "Weekly music session", "Weekly game night"][index],
        scheduled_start_time: weeklyStart, scheduled_end_time: null,
        recurrence_rule: { start: weeklyStart, end: null, frequency: 2, interval: 1, by_weekday: [weekday] }
    } as unknown as GuildScheduledEvent);
}

function Preview() {
    const [language, setLanguage] = useState<string>(() => localStorage.getItem("timeline-demo-language") ?? "auto");
    const [hidden, setHidden] = useState<string[]>([]);
    const [backgroundClicks, setBackgroundClicks] = useState(0);
    const [openedGuild, setOpenedGuild] = useState<string | null>(null);
    const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>(() => {
        try { return JSON.parse(localStorage.getItem("timeline-demo-saved") ?? "[]"); } catch { return []; }
    });
    const [personalMinutes, setPersonalMinutes] = useState(() => Number(localStorage.getItem("timeline-demo-minutes")) || 60);
    const [focus, setFocus] = useState<CalendarFocus>();
    const nonce = useRef(0);
    useEffect(() => { localStorage.setItem("timeline-demo-saved", JSON.stringify(personalEvents)); }, [personalEvents]);
    useEffect(() => { localStorage.setItem("timeline-demo-minutes", String(personalMinutes)); }, [personalMinutes]);
    const seconds = Math.floor((midnight + 5 * 24 * HOUR + 18 * HOUR) / 1000);
    const id = personalId("900", "901", seconds);
    const saved = personalEvents.some(event => event.id === id);
    function openSaved() { setFocus({ id, nonce: ++nonce.current }); }
    function addSaved() {
        setPersonalEvents(events => savePersonal(events, { id, channelId: "900", messageId: "901", guildId: "201", guildName: "Neon District", guildIcon: null, title: "Planning meetup", description: `Synthetic message: Planning meetup <t:${seconds}:F>`, start: seconds * 1000, minutes: validMinutes(personalMinutes) ? personalMinutes : 60 }));
        openSaved();
    }
    return <><button id="preview-discord-background" aria-label="Discord background" onClick={() => setBackgroundClicks(backgroundClicks + 1)} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", background: "#0d0e13" }} />
        <output id="preview-background-clicks" style={{ position: "fixed", bottom: 0, left: 0, color: "white", fontSize: 10 }}>Background clicks: {backgroundClicks}{openedGuild && ` · Opened server: ${openedGuild}`}</output>
        <div id="preview-message" style={{ position: "fixed", bottom: 8, left: 160, color: "white", zIndex: 20, fontSize: 12 }}>Preview message: Planning meetup <time>{new Date(seconds * 1000).toLocaleString("en-US")}</time>{saved && <TimestampBadge label="Open in calendar" onOpen={openSaved} />} <button onClick={addSaved}>{saved ? "Open saved timestamp" : "Add timestamp to calendar"}</button></div>
        <div id="preview-discord-modal-layer" style={{ position: "fixed", inset: 24, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="set-dialog"><Timeline
        guilds={guilds} events={events} load={{ loading: false, done: 6, total: 6, errors: [], updated: Date.now() }}
        duration={2} recurrenceDates={recurrenceDates} hiddenGuilds={hidden} initialView="timeline" initialZoom={140}
        language={language} discordLocale="en-US" onLanguageChange={(language: Language | "auto") => { setLanguage(language); localStorage.setItem("timeline-demo-language", language); }}
        personalEvents={personalEvents} personalMinutes={personalMinutes} focus={focus} onPersonalMinutes={setPersonalMinutes}
        onEditPersonal={(id, minutes) => setPersonalEvents(events => editPersonal(events, id, minutes))}
        onRemovePersonal={id => setPersonalEvents(events => removePersonal(events, id))}
        onHiddenChange={setHidden} onViewChange={() => {}} onZoomChange={() => {}} onRefresh={() => {}}
        onEvent={() => {}} onClose={() => {}} onGuild={id => setOpenedGuild(guilds.find(guild => guild.id === id)?.name ?? id)}
    /></div></div></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
