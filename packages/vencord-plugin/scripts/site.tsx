import "../style.css";
import "./site.css";

import type { Guild, GuildScheduledEvent } from "@vencord/discord-types";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { LoadState } from "../loader";
import { recurrenceDates } from "./recurrence.mjs";
import { Timeline } from "../Timeline";
import type { Language } from "../i18n";

interface PublishedEvent {
    id: string;
    title: string;
    start: string;
    end?: string;
    location?: string;
    desc?: string;
    url?: string;
    source: string;
    group?: string;
    guild_icon?: string | null;
    tags: string[];
    priority: string;
    recurrence?: { rule: GuildScheduledEvent["recurrence_rule"]; exceptions: GuildScheduledEvent["guild_scheduled_event_exceptions"]; history?: { id: string; start: number; end: number; estimatedEnd?: boolean }[]; };
    status: "scheduled" | "active" | "cancelled" | "completed";
}

const copy = navigator.language.startsWith("ru") ? {
    title: "Таймлайн событий", subtitle: "Общее расписание", source: "Открыть источник ↗", cached: "Публичный календарь",
    error: "Не удалось загрузить события. Попробуй обновить.", cancelled: "Отменено", completed: "Завершено", auto: "Язык браузера"
} : {
    title: "Events Timeline", subtitle: "Shared calendar", source: "Open source ↗", cached: "Public calendar",
    error: "Could not load events. Try refreshing.", cancelled: "Cancelled", completed: "Completed", auto: "Browser language"
};
const eventId = /^\/e\/([A-Za-z0-9_-]+)$/.exec(location.pathname)?.[1];
const noop = () => {};

function Site() {
    const [items, setItems] = useState<PublishedEvent[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [language, setLanguage] = useState(() => localStorage.getItem("timeline-language") ?? "auto");
    const [load, setLoad] = useState<LoadState>({ loading: true, done: 0, total: 1, errors: [], updated: null });
    const [error, setError] = useState(false);
    const loading = useRef(false);
    async function refresh() {
        if (loading.current) return;
        loading.current = true;
        setLoad(current => ({ ...current, loading: true }));
        try {
            const response = await fetch("/timeline/feed", { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw Error("feed");
            const { events } = await response.json();
            setItems(events);
            setError(false);
            setLoad({ loading: false, done: 1, total: 1, errors: [], updated: Date.now() });
        } catch {
            setError(true);
            setLoad(current => ({ ...current, loading: false }));
        } finally { loading.current = false; }
    }
    useEffect(() => {
        void refresh();
        const timer = setInterval(refresh, 60_000);
        return () => clearInterval(timer);
    }, []);

    const byId = new Map(items.map(item => [item.id, item]));
    const groups = new Map<string, Guild>();
    const completed = new Set<string>();
    const events = items.flatMap(item => {
        const name = item.group || item.source;
        const discordGuild = /^https:\/\/discord\.com\/events\/(\d+)\/\d+(?:\?|$)/.exec(item.url ?? "")?.[1];
        const group = discordGuild ?? item.source + ":" + name;
        const icon = item.guild_icon ?? groups.get(group)?.icon ?? null;
        groups.set(group, { id: group, name, icon } as Guild);
        const start = Date.parse(item.start);
        const active = start <= Date.now() && Date.now() < (item.end ? Date.parse(item.end) : start + 7_200_000);
        const event = {
            id: item.id, guild_id: group, name: item.title,
            scheduled_start_time: item.start, scheduled_end_time: item.end ?? null,
            description: item.desc, entity_metadata: { location: item.location },
            status: item.recurrence ? (item.status === "cancelled" ? 4 : item.status === "completed" ? 3 : item.status === "active" ? 2 : 1) : item.status !== "cancelled" && active ? 2 : 1,
            recurrence_rule: item.recurrence?.rule ?? null,
            guild_scheduled_event_exceptions: item.recurrence?.exceptions ?? []
        } as GuildScheduledEvent;
        const history = item.recurrence?.history ?? [];
        const archived = new Set(history.map(occurrence => occurrence.id));
        if (event.recurrence_rule) {
            event.guild_scheduled_event_exceptions = [
                ...event.guild_scheduled_event_exceptions.filter(exception => !archived.has(exception.event_exception_id)),
                ...history.map(occurrence => ({ event_exception_id: occurrence.id, is_canceled: true }))
            ];
        }
        const past = history.map(occurrence => {
            const id = item.id + "-past-" + occurrence.id;
            completed.add(id);
            byId.set(id, item);
            return {
                ...event, id, status: 1, recurrence_rule: null, guild_scheduled_event_exceptions: [],
                scheduled_start_time: new Date(occurrence.start).toISOString(),
                scheduled_end_time: new Date(occurrence.end).toISOString()
            } as GuildScheduledEvent;
        });
        return [event, ...past];
    });
    return <div className="set-dialog set-site"><Timeline
        guilds={[...groups.values()].sort((a,b) => a.name.localeCompare(b.name))}
        events={events} load={load} duration={2} recurrenceDates={recurrenceDates}
        hiddenGuilds={hidden} initialView="timeline" initialZoom={140}
        language={language} discordLocale={navigator.language}
        onLanguageChange={(value: Language | "auto") => { setLanguage(value); localStorage.setItem("timeline-language", value); }}
        personalEvents={[]} personalMinutes={60} onPersonalMinutes={noop} onEditPersonal={noop} onRemovePersonal={noop}
        onHiddenChange={setHidden} onViewChange={noop} onZoomChange={noop} onRefresh={refresh}
        focusEvent={eventId && byId.has(eventId) ? eventId : undefined}
        publicView={{ ...copy, warning: error ? copy.error : undefined,
            url: id => byId.get(id)?.url,
            detail: id => {
                const item = byId.get(id);
                if (!item) return null;
                const labels = [...item.tags.map(tag => "#" + tag), ...(item.priority === "normal" ? [] : [item.priority])];
                return <>{completed.has(id) ? <p className="set-muted">{copy.completed}</p> : item.status === "cancelled" && <p className="set-warning">{copy.cancelled}</p>}
                    {labels.length > 0 && <p className="set-detail-tags">{labels.join(" · ")}</p>}</>;
            }
        }}
    /></div>;
}
createRoot(document.getElementById("root")!).render(<Site />);
