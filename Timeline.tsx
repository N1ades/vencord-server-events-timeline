/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Guild, GuildScheduledEvent } from "@vencord/discord-types";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "@webpack/common";
import type { CSSProperties, PointerEvent } from "react";

import { dayWindow, expandEvents, extendTimeline, guildHue, HOUR, layoutLanes, localDate, Occurrence, RecurrenceDates, shiftCalendarDays, timelineWindow } from "./core";
import { Language, languages, resolveLanguage, translator } from "./i18n";
import type { LoadState } from "./loader";

export interface TimelineProps {
    guilds: Guild[];
    events: GuildScheduledEvent[];
    load: LoadState;
    duration: number;
    recurrenceDates: RecurrenceDates;
    hiddenGuilds: string[];
    initialView: "timeline" | "list";
    initialZoom: number;
    language: string;
    discordLocale: string;
    onLanguageChange(language: Language | "auto"): void;
    onHiddenChange(ids: string[]): void;
    onViewChange(view: "timeline" | "list"): void;
    onZoomChange(zoom: number): void;
    onRefresh(): void;
    onEvent(occurrence: Occurrence): void;
    onGuild(guildId: string): void;
    onClose(): void;
}

function Icon({ guild }: { guild: Guild; }) {
    return guild.icon
        ? <img className="set-guild-icon" src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=64`} alt="" />
        : <span className="set-guild-icon set-initial">{guild.name.slice(0, 2)}</span>;
}

export function Timeline(props: TimelineProps) {
    const { t, count, locale } = useMemo(() => translator(resolveLanguage(props.language, props.discordLocale)), [props.language, props.discordLocale]);
    const time = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const dateTime = (ms: number) => new Date(ms).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    function label(occurrence: Occurrence) {
        return `${occurrence.event.name}\n${dateTime(occurrence.start)} — ${dateTime(occurrence.end)}${occurrence.estimatedEnd ? ` (${t("estimated")})` : ""}${occurrence.event.description ? `\n${occurrence.event.description}` : ""}`;
    }
    const [day, setDay] = useState(() => localDate(new Date()));
    const [days, setDays] = useState(1);
    const [query, setQuery] = useState("");
    const [serverQuery, setServerQuery] = useState("");
    const [view, setView] = useState(props.initialView);
    const [zoom, setZoom] = useState(props.initialZoom);
    const [onlyActive, setOnlyActive] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState<Occurrence | null>(null);
    const [now, setNow] = useState(Date.now());
    const scroller = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number; moved: boolean; } | null>(null);
    const suppressClick = useRef(false);
    const [dragging, setDragging] = useState(false);
    const [window, setWindow] = useState(() => timelineWindow(Date.now()));
    const [navigation, setNavigation] = useState(0);
    const pendingTime = useRef<number | null>(Date.now() - 100 / props.initialZoom * HOUR);
    const viewportTime = useRef(pendingTime.current!);
    const [from, to] = useMemo(() => view === "timeline" ? window : dayWindow(day, days), [window, view, day, days]);
    const hidden = useMemo(() => new Set(props.hiddenGuilds), [props.hiddenGuilds]);
    const pxPerHour = days === 7 ? zoom * 0.65 : zoom;
    const timelineWidth = (to - from) / HOUR * pxPerHour;
    const occurrences = useMemo(() => expandEvents(props.events, from, to, props.duration, props.recurrenceDates), [props.events, from, to, props.duration, props.recurrenceDates]);
    const q = query.trim().toLocaleLowerCase();
    const guildById = useMemo(() => new Map(props.guilds.map(guild => [guild.id, guild])), [props.guilds]);
    const visible = occurrences.filter(o => !hidden.has(o.event.guild_id) && (!onlyActive || o.active) &&
        (!q || `${o.event.name} ${o.event.description ?? ""} ${o.event.entity_metadata?.location ?? ""} ${guildById.get(o.event.guild_id)?.name ?? ""}`.toLocaleLowerCase().includes(q)));
    const visibleGuildCount = new Set(visible.map(o => o.event.guild_id)).size;
    const layout = layoutLanes(visible, from, to, pxPerHour);
    const ticks: number[] = [];
    for (let tick = from; tick < to; tick += HOUR) ticks.push(tick);
    const currentX = (now - from) / HOUR * pxPerHour;
    const selectedCurrent = selected ? occurrences.find(o => o.key === selected.key) ?? selected : null;
    const selectedGuild = selectedCurrent ? guildById.get(selectedCurrent.event.guild_id) : null;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);

    // Restore the same timestamp before painting after a window shift or zoom.
    useLayoutEffect(() => {
        if (!scroller.current) return;
        const target = pendingTime.current ?? viewportTime.current;
        scroller.current.scrollLeft = Math.max(0, (target - from) / HOUR * pxPerHour);
        viewportTime.current = from + scroller.current.scrollLeft / pxPerHour * HOUR;
        pendingTime.current = null;
    }, [from, pxPerHour, view, navigation]);

    function onScroll() {
        const element = scroller.current;
        if (!element || pendingTime.current !== null) return;
        const leftTime = from + element.scrollLeft / pxPerHour * HOUR;
        viewportTime.current = leftTime;
        setDay(localDate(new Date(leftTime + 100 / pxPerHour * HOUR)));
        const next = extendTimeline(from, to, leftTime, leftTime + element.clientWidth / pxPerHour * HOUR);
        if (next) {
            pendingTime.current = leftTime;
            setWindow(next);
        }
    }

    function startDrag(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || event.pointerType !== "mouse" || !(event.target as HTMLElement).closest(".set-grid")) return;
        suppressClick.current = false;
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    }

    function moveDrag(event: PointerEvent<HTMLDivElement>) {
        const { current } = drag;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!(event.buttons & 1)) { finishDrag(event); return; }
        if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
        if (!current.moved) {
            current.moved = true;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        // Incremental movement keeps dragging continuous when the infinite window rebases.
        const deltaX = event.clientX - current.x;
        if (pendingTime.current !== null) pendingTime.current -= deltaX / pxPerHour * HOUR;
        event.currentTarget.scrollLeft -= deltaX;
        event.currentTarget.scrollTop -= event.clientY - current.y;
        current.x = event.clientX;
        current.y = event.clientY;
        onScroll();
    }

    function finishDrag(event: PointerEvent<HTMLDivElement>) {
        const { current } = drag;
        if (!current || current.pointerId !== event.pointerId) return;
        suppressClick.current = current.moved && event.type === "pointerup";
        drag.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }

    function jumpTo(ms: number, atNow = false) {
        pendingTime.current = ms - (atNow ? 100 / pxPerHour * HOUR : 0);
        viewportTime.current = pendingTime.current;
        setWindow(timelineWindow(ms));
        setDay(localDate(new Date(ms)));
        setNavigation(value => value + 1);
    }

    function returnToNow() {
        const current = Date.now();
        setNow(current);
        switchView("timeline");
        jumpTo(current, true);
    }

    function shiftDay(amount: number) {
        const start = dayWindow(day, 1)[0];
        jumpTo(shiftCalendarDays(start, amount));
    }

    function switchView(value: "timeline" | "list") { setView(value); props.onViewChange(value); }

    const style = { "--set-hour": `${pxPerHour}px` } as CSSProperties;
    return <div className="set-app" style={style} lang={locale}>
        <header className="set-header">
            <div className="set-brand"><span className="set-logo">TL</span><div><h1>{t("title")}</h1><p>{t("subtitle")} · {timezone}</p></div></div>
            <div className="set-actions">
                <select className="set-language" aria-label={t("language")} value={props.language} onChange={e => props.onLanguageChange(e.target.value as Language | "auto")}>
                    <option value="auto">{t("auto")}</option>{languages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
                </select>
                <button onClick={props.onRefresh} disabled={props.load.loading}>{props.load.loading ? `${props.load.done} / ${props.load.total}` : t("refresh")}</button>
                <button className="set-close" aria-label={t("close")} onClick={props.onClose}>✕</button>
            </div>
        </header>
        <div className="set-toolbar">
            <div className="set-actions">
                <button aria-label={t("previous")} onClick={() => shiftDay(-days)}>‹</button>
                <input type="date" aria-label={t("date")} value={day} onChange={e => { if (e.target.value) jumpTo(dayWindow(e.target.value, 1)[0]); }} />
                <button aria-label={t("next")} onClick={() => shiftDay(days)}>›</button>
                <button aria-label={t("returnNow")} onClick={returnToNow}>{t("now")}</button>
                <select aria-label={t("period")} value={days} onChange={e => setDays(Number(e.target.value))}>
                    <option value={1}>{t("day")}</option><option value={3}>{t("threeDays")}</option><option value={7}>{t("week")}</option>
                </select>
            </div>
            <input className="set-search" type="search" placeholder={t("searchPlaceholder")} aria-label={t("search")} value={query} onChange={e => setQuery(e.target.value)} />
            <div className="set-actions">
                <button aria-pressed={showFilters} aria-controls="set-server-filters" onClick={() => setShowFilters(!showFilters)}>{t("servers")}{hidden.size ? ` (${t("hidden", { count: props.guilds.filter(g => hidden.has(g.id)).length })})` : ""}</button>
                <button aria-pressed={view === "timeline"} onClick={() => switchView("timeline")}>{t("timeline")}</button>
                <button aria-pressed={view === "list"} onClick={() => switchView("list")}>{t("list")}</button>
            </div>
        </div>
        <div className="set-workspace">
            {showFilters && <aside className="set-sidebar" id="set-server-filters">
                <div className="set-sidebar-title"><h2>{t("servers")} <span>{props.guilds.length}</span></h2><button onClick={() => props.onHiddenChange(hidden.size ? [] : props.guilds.map(g => g.id))}>{hidden.size ? t("all") : t("clear")}</button></div>
                <input type="search" aria-label={t("searchServers")} placeholder={t("serverPlaceholder")} value={serverQuery} onChange={e => setServerQuery(e.target.value)} />
                <div className="set-server-list">
                    {props.guilds.filter(g => g.name.toLocaleLowerCase().includes(serverQuery.toLocaleLowerCase())).map(guild => {
                        const count = occurrences.filter(o => o.event.guild_id === guild.id).length;
                        return <label className="set-server" key={guild.id} title={guild.name}>
                            <input type="checkbox" checked={!hidden.has(guild.id)} onChange={e => props.onHiddenChange(e.target.checked ? props.hiddenGuilds.filter(id => id !== guild.id) : [...props.hiddenGuilds, guild.id])} />
                            <Icon guild={guild} /><span>{guild.name}</span><small>{count || "—"}</small>
                        </label>;
                    })}
                </div>
                <label className="set-live-filter"><input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> {t("onlyActive")}</label>
                {view === "timeline" && <label className="set-zoom">{t("zoom")}<input aria-label={t("zoomLabel")} type="range" min={60} max={240} step={20} value={zoom} onChange={e => { const z = Number(e.target.value); setZoom(z); props.onZoomChange(z); }} /></label>}
            </aside>}
            <main className="set-main">
                <div className="set-status" role="status">
                    <span>{new Date(dayWindow(day, 1)[0]).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {count(visible.length, "events")} · {count(visibleGuildCount, "guilds")}</span>
                    <span>{props.load.loading ? t("loadingServers", { done: props.load.done, total: props.load.total }) : props.load.updated ? t("checked", { time: time(props.load.updated) }) : t("cached")}</span>
                </div>
                {props.load.errors.length > 0 && <div className="set-warning">{t("warning", { count: props.load.errors.length, servers: props.load.errors.map(id => guildById.get(id)?.name ?? id).join(", ") })}</div>}
                {view === "timeline"
                        ? <div className={`set-grid-scroll ${dragging ? "set-dragging" : ""}`} ref={scroller} onScroll={onScroll} tabIndex={0} role="region" aria-label={t("gridLabel")}
                            onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
                            onDragStart={event => event.preventDefault()} onClickCapture={event => {
                                if (!suppressClick.current || event.detail === 0) return;
                                suppressClick.current = false;
                                event.preventDefault();
                                event.stopPropagation();
                            }}>
                            <div className="set-grid" data-from={from} data-to={to} style={{ width: timelineWidth }}>
                                <div className="set-ruler"><div className="set-hours" style={{ width: timelineWidth }}>
                                    {ticks.map(tick => <div className={`set-tick ${new Date(tick).getHours() === 0 ? "set-midnight" : ""} ${[0, 6].includes(new Date(tick).getDay()) ? "set-weekend" : ""}`} key={tick} style={{ left: (tick - from) / HOUR * pxPerHour, width: pxPerHour }} title={new Date(tick).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}><small>{new Date(tick).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}</small><span>{time(tick)}</span></div>)}
                                </div></div>
                                <div className="set-tracks" style={{ height: layout.lanes * 48 + 8 }}>
                                    {layout.items.map(({ occurrence: o, left, width, lane }) => {
                                        const guild = guildById.get(o.event.guild_id)!;
                                        return <button className={`set-event ${o.active ? "set-active" : ""} ${o.estimatedEnd ? "set-estimated" : ""}`} key={o.key} title={`${guild.name}\n${label(o)}`} aria-label={`${guild.name}: ${label(o)}`} onClick={() => setSelected(o)} style={{ left, width, top: 4 + lane * 48, "--set-hue": guildHue(guild.id), "--set-label-width": `${Math.max(0, Math.min(420, width - 20))}px` } as CSSProperties}>
                                            <span className="set-event-content">
                                                <span className="set-event-head"><Icon guild={guild} /><strong>{o.event.name}</strong></span>
                                                <span className="set-event-meta"><span className="set-event-guild">{guild.name}</span><span className="set-event-time">{o.active && <b className="set-live-dot" />} {time(o.start)} — {o.estimatedEnd ? "≈ " : ""}{time(o.end)}{o.recurrenceId && " ↻"}</span></span>
                                            </span>
                                        </button>;
                                    })}
                                    {now >= from && now < to && <div className="set-now-line" style={{ left: currentX }}><span>{time(now)}</span></div>}
                                </div>
                                {visible.length === 0 && <div className="set-grid-empty">{props.load.loading ? t("loading") : t("emptyGrid")}</div>}
                            </div>
                        </div>
                        : visible.length === 0
                            ? <div className="set-empty"><span>◇</span><h2>{props.load.loading ? t("loading") : t("empty")}</h2><p>{t("emptyHint")}</p></div>
                            : <div className="set-agenda">{visible.map(o => {
                            const guild = guildById.get(o.event.guild_id)!;
                            return <button className="set-agenda-item" key={o.key} onClick={() => setSelected(o)} style={{ "--set-hue": guildHue(guild.id) } as CSSProperties}>
                                <span className="set-agenda-date">{dateTime(o.start)}<small>{t("until")} {o.estimatedEnd ? "≈ " : ""}{dateTime(o.end)}</small></span>
                                <Icon guild={guild} /><div><strong>{o.event.name}</strong><p>{guild.name}{o.recurrenceId ? ` · ${t("repeats")}` : ""}</p></div>{o.active && <span className="set-live-badge">{t("liveShort")}</span>}
                            </button>;
                        })}</div>}
                <footer className="set-footnote"><span className="set-live-dot" /> {t("live")} <span>↻ {t("repeats")}</span><span>{t("estimateLegend", { hours: props.duration })}</span></footer>
            </main>
            {selectedCurrent && selectedGuild && <aside className="set-detail">
                <button className="set-detail-close" aria-label={t("closeDetail")} onClick={() => setSelected(null)}>✕</button>
                {selectedCurrent.event.image && <img className="set-cover" src={`https://cdn.discordapp.com/guild-events/${selectedCurrent.event.id}/${selectedCurrent.event.image}.webp?size=1024`} alt="" />}
                <div className="set-detail-content"><a className="set-detail-guild set-guild-link" href={`/channels/${selectedGuild.id}`} title={t("openServer", { server: selectedGuild.name })} onClick={event => {
                    event.preventDefault();
                    props.onGuild(selectedGuild.id);
                }}><Icon guild={selectedGuild} />{selectedGuild.name}</a>
                    {selectedCurrent.active && <span className="set-live-badge">{t("live")}</span>}
                    <h2>{selectedCurrent.event.name}</h2><p className="set-detail-time">{dateTime(selectedCurrent.start)}<br />{t("until")} {selectedCurrent.estimatedEnd ? "≈ " : ""}{dateTime(selectedCurrent.end)}</p>
                    {selectedCurrent.estimatedEnd && <p className="set-muted">{t("estimateHint")}</p>}
                    {selectedCurrent.recurrenceId && <p className="set-muted">↻ {t("repeatedEvent")}</p>}
                    {selectedCurrent.event.entity_metadata?.location && <p>⌖ {selectedCurrent.event.entity_metadata.location}</p>}
                    <p className="set-description">{selectedCurrent.event.description || t("noDescription")}</p>
                    <button className="set-primary" onClick={() => props.onEvent(selectedCurrent)}>{t("openEvent")}</button>
                </div>
            </aside>}
        </div>
    </div>;
}
