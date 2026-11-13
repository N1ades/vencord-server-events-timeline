import type { Guild, GuildScheduledEvent } from "@vencord/discord-types";

import { expandEvents, HOUR, RecurrenceDates, snowflakeTime } from "./core";

export function discordPublications(guilds: Guild[], events: GuildScheduledEvent[], eligible: (event: GuildScheduledEvent) => boolean, dates: RecurrenceDates) {
    const names = new Map(guilds.map(guild => [guild.id, guild.name]));
    const now = Date.now();
    const from = now - 7 * 24 * HOUR;
    const to = now + 90 * 24 * HOUR;
    const data = [];
    for (const event of events) {
        if (!eligible(event) || !names.has(event.guild_id)) continue;
        const url = `https://discord.com/events/${event.guild_id}/${event.id}`;
        for (const occurrence of expandEvents([event], from, to, 2, dates)) {
            const { recurrenceId } = occurrence;
            const link = recurrenceId ? url + "?event_exception_id=" + recurrenceId : url;
            data.push({
                action: "upsert", id: "discord-" + event.id + (recurrenceId ? "-" + recurrenceId : ""),
                guild: event.guild_id, title: event.name, start: new Date(occurrence.start).toISOString(),
                end: occurrence.estimatedEnd ? "" : new Date(occurrence.end).toISOString(),
                desc: event.description ?? "", location: event.entity_metadata?.location ?? "",
                url: link, group: names.get(event.guild_id)!, status: occurrence.active ? "active" : "scheduled"
            });
        }
        if (event.status === 4) {
            data.push({ action: "cancel", id: "discord-" + event.id, series: "1", guild: event.guild_id });
            continue;
        }
        for (const exception of event.guild_scheduled_event_exceptions ?? []) {
            if (exception.is_canceled && snowflakeTime(exception.event_exception_id) >= from) {
                data.push({ action: "cancel", id: "discord-" + event.id + "-" + exception.event_exception_id, guild: event.guild_id });
            }
        }
    }
    return data;
}
