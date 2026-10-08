/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuildScheduledEvent, GuildScheduledEventRecurrenceRule } from "@vencord/discord-types";

export const HOUR = 3_600_000;

/** Shift by calendar days, including 23/25-hour days in local time. */
export function shiftCalendarDays(ms: number, days: number) {
    const date = new Date(ms);
    date.setDate(date.getDate() + days);
    return date.getTime();
}

export function timelineWindow(ms: number) {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    const from = shiftCalendarDays(date.getTime(), -7);
    return [from, shiftCalendarDays(from, 21)] as const;
}

/** Rebase around the viewport, keeping a bounded number of ticks/recurrences. */
export function extendTimeline(from: number, to: number, leftTime: number, rightTime: number) {
    return leftTime < shiftCalendarDays(from, 3) || rightTime > shiftCalendarDays(to, -3)
        ? timelineWindow(leftTime)
        : null;
}
export interface Occurrence {
    key: string;
    event: GuildScheduledEvent;
    recurrenceId: string | null;
    start: number;
    end: number;
    estimatedEnd: boolean;
    active: boolean;
}

interface Exception {
    event_exception_id: string;
    is_canceled?: boolean;
    scheduled_start_time?: string | null;
    scheduled_end_time?: string | null;
}

export type RecurrenceDates = (rule: GuildScheduledEventRecurrenceRule, from: Date, to: Date) => Date[];

/** The event store keeps API snake_case fields; Discord's RRULE converter expects camelCase. */
function normalizeRecurrenceRule(rule: GuildScheduledEventRecurrenceRule): GuildScheduledEventRecurrenceRule {
    const stored = rule as GuildScheduledEventRecurrenceRule & {
        by_weekday?: GuildScheduledEventRecurrenceRule["byWeekday"];
        by_n_weekday?: GuildScheduledEventRecurrenceRule["byNWeekday"];
        by_month?: GuildScheduledEventRecurrenceRule["byMonth"];
        by_month_day?: GuildScheduledEventRecurrenceRule["byMonthDay"];
        by_year_day?: GuildScheduledEventRecurrenceRule["byYearDay"];
    };
    return {
        ...rule,
        byWeekday: stored.byWeekday ?? stored.by_weekday ?? null,
        byNWeekday: stored.byNWeekday ?? stored.by_n_weekday ?? null,
        byMonth: stored.byMonth ?? stored.by_month ?? null,
        byMonthDay: stored.byMonthDay ?? stored.by_month_day ?? null,
        byYearDay: stored.byYearDay ?? stored.by_year_day ?? null
    };
}

export function snowflakeTime(id: string): number {
    try { return Number(BigInt(id) >> 22n) + 1_420_070_400_000; }
    catch { return NaN; }
}

export function recurrenceId(time: number): string {
    return ((BigInt(Math.floor(time / 1000) * 1000) - 1_420_070_400_000n) << 22n).toString();
}

/** Expand only the visible window, preserving Discord's UTC recurrence rules and exceptions. */
export function expandEvents(events: GuildScheduledEvent[], from: number, to: number, defaultHours: number, dates: RecurrenceDates): Occurrence[] {
    const output: Occurrence[] = [];
    const seen = new Set<string>();
    for (const event of events) {
        if (event.status === 3 || event.status === 4) continue;
        const base = Date.parse(event.scheduled_start_time);
        if (!Number.isFinite(base)) continue;
        const explicitEnd = event.scheduled_end_time == null ? NaN : Date.parse(event.scheduled_end_time);
        const duration = explicitEnd > base ? explicitEnd - base : Math.max(0.25, defaultHours) * HOUR;
        const estimatedEnd = !(explicitEnd > base);
        const exceptions = (event.guild_scheduled_event_exceptions ?? []) as Exception[];
        const starts = new Set<number>();
        if (event.recurrence_rule) {
            for (const date of dates(normalizeRecurrenceRule(event.recurrence_rule), new Date(from - duration), new Date(to))) starts.add(date.getTime());
            // A rescheduled occurrence may move into the window from outside it.
            for (const exception of exceptions) starts.add(snowflakeTime(exception.event_exception_id));
        } else starts.add(base);
        // Keep an ongoing event visible even if its unspecified end is already in the past.
        if (event.status === 2) starts.add(base);
        for (const original of starts) {
            if (!Number.isFinite(original)) continue;
            const id = event.recurrence_rule ? recurrenceId(original) : null;
            const exception = exceptions.find(e => e.event_exception_id === id);
            if (exception?.is_canceled) continue;
            const start = exception?.scheduled_start_time ? Date.parse(exception.scheduled_start_time) : original;
            let end = exception?.scheduled_end_time ? Date.parse(exception.scheduled_end_time) : start + duration;
            const active = event.status === 2 && original === base;
            if (active && estimatedEnd) end = Math.max(end, Date.now() + HOUR / 4);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= from || start >= to) continue;
            const key = `${event.id}:${id ?? "once"}`;
            if (seen.has(key)) continue;
            seen.add(key);
            output.push({ key, event, recurrenceId: id, start, end, estimatedEnd: estimatedEnd && !exception?.scheduled_end_time, active });
        }
    }
    return output.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}

/** Give simultaneous events their own lane; compare rendered widths so short blocks never overlap. */
export function layoutLanes(events: Occurrence[], from: number, to: number, pxPerHour: number) {
    const ends: number[] = [];
    const width = (to - from) / HOUR * pxPerHour;
    const items = events.map(occurrence => {
        const left = Math.max(0, (occurrence.start - from) / HOUR * pxPerHour);
        const natural = (Math.min(to, occurrence.end) - Math.max(from, occurrence.start)) / HOUR * pxPerHour;
        const blockWidth = Math.min(width - left, Math.max(32, natural) - 3);
        let lane = ends.findIndex(end => end <= left);
        if (lane < 0) lane = ends.length;
        ends[lane] = left + blockWidth + 3;
        return { occurrence, left, width: blockWidth, lane };
    });
    return { items, lanes: Math.max(1, ends.length) };
}

export function localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayWindow(date: string, days: number): [number, number] {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return [start.getTime(), end.getTime()];
}

export function guildHue(id: string): number {
    let hash = 0;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return ((hash % 360) + 360) % 360;
}
