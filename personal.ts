/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuildScheduledEvent } from "@vencord/discord-types";

import { HOUR, Occurrence } from "./core";

export interface PersonalEvent {
    id: string;
    channelId: string;
    messageId: string;
    guildId: string | null;
    guildName: string;
    guildIcon: string | null;
    title: string;
    description: string;
    start: number;
    minutes: number;
}

export interface CalendarFocus { id: string; nonce: number; }

export function personalId(channelId: string, messageId: string, seconds: number) {
    return `saved:${channelId}:${messageId}:${seconds}`;
}

export function validMinutes(value: number) {
    return Number.isSafeInteger(value) && value >= 1 && value <= 525600;
}

/** Walk Discord's parsed markdown so code blocks and inline code are not added as dates. */
export function parsedTimestamps(ast: unknown): number[] {
    const values = new Set<number>();
    function visit(node: unknown) {
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (!node || typeof node !== "object") return;
        const value = node as { type?: string; timestamp?: string; content?: unknown; items?: unknown; };
        if (value.type === "timestamp") {
            const seconds = Number(value.timestamp);
            if (Number.isSafeInteger(seconds) && Number.isFinite(new Date(seconds * 1000).getTime())) values.add(seconds);
        } else {
            visit(value.content);
            visit(value.items);
        }
    }
    visit(ast);
    return [...values];
}

export function personalTitle(content: string, fallback: string) {
    const text = content.replace(/<t:-?\d+(?::[tTdDfFR])?>/g, "").replace(/<[@#][^>]+>/g, "").replace(/[*_~`|]/g, "").replace(/\s+/g, " ").trim();
    return text.slice(0, 140) || fallback;
}

export function personalOccurrence(saved: PersonalEvent, now = Date.now()): Occurrence {
    const end = saved.start + saved.minutes / 60 * HOUR;
    const event = {
        id: saved.id, guild_id: saved.guildId ?? "@personal", channel_id: saved.channelId,
        name: saved.title, description: saved.description, image: null,
        scheduled_start_time: new Date(saved.start).toISOString(), scheduled_end_time: new Date(end).toISOString(),
        status: 1, entity_type: 3, recurrence_rule: null, guild_scheduled_event_exceptions: [], entity_metadata: null
    } as unknown as GuildScheduledEvent;
    return { key: saved.id, event, personal: saved, recurrenceId: null, start: saved.start, end, estimatedEnd: false, active: now >= saved.start && now < end };
}

export function savePersonal(events: PersonalEvent[], event: PersonalEvent) {
    return events.some(item => item.id === event.id) ? events : [...events, event];
}

export function editPersonal(events: PersonalEvent[], id: string, minutes: number) {
    return validMinutes(minutes) ? events.map(event => event.id === id ? { ...event, minutes } : event) : events;
}

export function removePersonal(events: PersonalEvent[], id: string) {
    return events.filter(event => event.id !== id);
}
