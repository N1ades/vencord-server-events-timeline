import type { Guild, GuildScheduledEvent } from "@vencord/discord-types";

import { expandEvents, HOUR, type RecurrenceDates } from "./core";

export function discordPublications(guilds: Guild[], events: GuildScheduledEvent[], eligible: (event: GuildScheduledEvent) => boolean, dates: RecurrenceDates) {
    const names = new Map(guilds.map(guild => [guild.id, guild.name]));
    const now = Date.now();
    const cutoff = now - 7 * 24 * HOUR;
    const data = [];
    for (const event of events) {
        if (!eligible(event) || !names.has(event.guild_id)) continue;
        const id = "discord-" + event.id;
        const guild = event.guild_id;
        if (event.status === 4) {
            data.push({ action: "cancel", id, guild, series: "1" });
            continue;
        }
        const rule = event.recurrence_rule;
        const start = Date.parse(event.scheduled_start_time);
        const end = event.scheduled_end_time == null ? NaN : Date.parse(event.scheduled_end_time);
        if (!Number.isFinite(start) || (!rule && event.status !== 2 && (end || start + 2 * HOUR) < cutoff)) continue;
        const exceptions = rule ? (event.guild_scheduled_event_exceptions ?? []).map(exception => ({
            event_exception_id: String(exception.event_exception_id),
            is_canceled: Boolean(exception.is_canceled),
            scheduled_start_time: exception.scheduled_start_time ?? null,
            scheduled_end_time: exception.scheduled_end_time ?? null
        })) : [];
        data.push({
            action: "upsert", id, guild, title: event.name, start: new Date(start).toISOString(),
            end: end > start ? new Date(end).toISOString() : "",
            desc: event.description ?? "", location: event.entity_metadata?.location ?? "",
            group: names.get(guild)!, status: event.status === 2 ? "active" : event.status === 3 && rule ? "completed" : "scheduled",
            recurrence: JSON.stringify(rule ? { rule, exceptions, history: expandEvents([{ ...event, status: 1 }], cutoff, now, 2, dates)
                .filter(item => item.end <= now && !item.active)
                .map(({ recurrenceId, start, end, estimatedEnd }) => ({ id: recurrenceId, start, end, estimatedEnd })) } : null)
        });
    }
    return data;
}
