/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ApplicationCommandInputType } from "@api/Commands";
import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import type { GuildScheduledEventRecurrenceRule, Message, RenderModalProps } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { ChannelStore, closeModal, Dialog, GuildScheduledEventStore, GuildStore, LocaleStore, Menu, NavigationRouter, openModal, Parser, PermissionsBits, PermissionStore, useEffect, useLayoutEffect, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";
import type { ReactNode } from "react";

import { Occurrence } from "./core";
import { resolveLanguage, translator } from "./i18n";
import { EventLoader } from "./loader";
import { CalendarFocus, editPersonal, parsedTimestamps, PersonalEvent, personalId, personalTitle, removePersonal, savePersonal, validMinutes } from "./personal";
import { settings } from "./settings";
import { Timeline } from "./Timeline";
import { TimestampBadge } from "./TimestampBadge";

const EventActions = findByPropsLazy("fetchGuildEventsForGuild") as { fetchGuildEventsForGuild(id: string): Promise<unknown>; };
const toRRule = findByCodeLazy(".byNWeekday", "byweekday:") as (rule: GuildScheduledEventRecurrenceRule) => { between(from: Date, to: Date, inclusive: boolean, iterator: (date: Date, index: number) => boolean): Date[]; };
const showEvent = findByCodeLazy("guildScheduledEventId:", "initialRecurrenceId:") as (props: { eventId: string; recurrenceId: string | null; }) => void;

let enabled = false;
let account: string | undefined;
let modalKey: string | undefined;
let focusRequest: CalendarFocus | undefined;
let focusNonce = 0;
const focusListeners = new Set<(focus: CalendarFocus | undefined) => void>();
const loader = new EventLoader(id => EventActions.fetchGuildEventsForGuild(id), () => enabled && account === UserStore.getCurrentUser()?.id);

function savedEvents() {
    const user = UserStore.getCurrentUser()?.id;
    return user ? settings.store.personalEvents?.[user] ?? [] : [];
}

function updateSaved(update: (events: PersonalEvent[]) => PersonalEvent[]) {
    const user = UserStore.getCurrentUser()?.id;
    if (!user) return;
    settings.store.personalEvents = { ...settings.store.personalEvents, [user]: update(savedEvents()) };
}

function addTimestamp(message: Message, seconds: number) {
    const id = personalId(message.channel_id, message.id, seconds);
    if (!savedEvents().some(event => event.id === id)) {
        const channel = ChannelStore.getChannel(message.channel_id);
        const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
        const { t } = translator(resolveLanguage(settings.store.language ?? "auto", LocaleStore.locale));
        const configured = settings.store.personalMinutes ?? 60;
        updateSaved(events => savePersonal(events, {
            id, channelId: message.channel_id, messageId: message.id, guildId: guild?.id ?? null,
            guildName: guild?.name ?? t("personalEvents"), guildIcon: guild?.icon ?? null,
            title: personalTitle(message.content, t("savedTimestamp")), description: message.content,
            start: seconds * 1000, minutes: validMinutes(configured) ? configured : 60
        }));
    }
    openTimeline(id);
}

const messageMenu: NavContextMenuPatchCallback = (children, { message, target }: { message: Message; target?: HTMLElement; }) => {
    if (!message?.content) return;
    let timestamps = parsedTimestamps(Parser.parseToAST(message.content));
    const clicked = target?.closest<HTMLElement>(".set-message-timestamp")?.dataset.timestamp;
    if (clicked !== undefined && timestamps.includes(Number(clicked))) timestamps = [Number(clicked)];
    if (!timestamps.length) return;
    const { t, locale } = translator(resolveLanguage(settings.store.language ?? "auto", LocaleStore.locale));
    const items = timestamps.map(seconds => {
        const saved = savedEvents().some(event => event.id === personalId(message.channel_id, message.id, seconds));
        return <Menu.MenuItem key={seconds} id={`set-save-timestamp-${seconds}`} label={timestamps.length === 1 ? t(saved ? "openSaved" : "addTimestamp") : `${saved ? "▦ " : ""}${new Date(seconds * 1000).toLocaleString(locale)}`} action={() => addTimestamp(message, seconds)} />;
    });
    children.push(<Menu.MenuGroup>{items.length === 1 ? items : <Menu.MenuItem id="set-message-timestamps" label={t("timestamps")}>{items}</Menu.MenuItem>}</Menu.MenuGroup>);
};

function MessageTimestamp({ seconds, state, children }: { seconds: number; state: { channelId?: string; messageId?: string; }; children: ReactNode; }) {
    const config = settings.use(["personalEvents", "language"]);
    const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const { t } = useTranslation();
    const element = useRef<HTMLSpanElement>(null);
    const [origin, setOrigin] = useState(state);
    useLayoutEffect(() => {
        if (state.channelId && state.messageId) { setOrigin(state); return; }
        const row = element.current?.closest('[id^="chat-messages-"]');
        const match = row?.id.match(/^chat-messages-(\d+)-(\d+)$/);
        if (match) setOrigin({ channelId: match[1], messageId: match[2] });
    }, [state.channelId, state.messageId]);
    const saved = user && origin.channelId && origin.messageId
        ? config.personalEvents?.[user]?.find(event => event.id === personalId(origin.channelId!, origin.messageId!, seconds))
        : undefined;
    return <span ref={element} className="set-message-timestamp" data-timestamp={seconds}>{children}{saved && <TimestampBadge label={t("openSaved")} onOpen={() => openTimeline(saved.id)} />}</span>;
}

function recurrenceDates(rule: GuildScheduledEventRecurrenceRule, from: Date, to: Date) {
    // Discord uses rrule itself; reuse it for monthly, yearly, weekday and nth-weekday rules.
    return toRRule(rule).between(from, to, true, (_, index) => index < 1000);
}

function EventTimelineModal({ onClose }: RenderModalProps) {
    const config = settings.use(["defaultDuration", "hiddenGuilds", "view", "zoom", "refreshAutomatically", "language", "personalEvents", "personalMinutes"]);
    const [load, setLoad] = useState(loader.state);
    const [focus, setFocus] = useState(focusRequest);
    const data = useStateFromStores([GuildStore, GuildScheduledEventStore, ChannelStore, PermissionStore, UserStore, LocaleStore], () => {
        const guilds = Object.values(GuildStore.getGuilds()).sort((a, b) => a.name.localeCompare(b.name));
        const events = guilds.flatMap(guild => GuildScheduledEventStore.getGuildScheduledEventsForGuild(guild.id) ?? []).filter(event => {
            if (!event.channel_id) return true;
            const channel = ChannelStore.getChannel(event.channel_id);
            return !!channel && PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel);
        });
        return { guilds, events, user: UserStore.getCurrentUser()?.id, discordLocale: LocaleStore.locale };
    });

    function refresh(force = false) {
        if (!enabled || data.user !== account) return;
        void loader.refresh(Object.keys(GuildStore.getGuilds()), force);
    }

    useEffect(() => loader.subscribe(() => setLoad(loader.state)), []);
    useEffect(() => { focusListeners.add(setFocus); return () => { focusListeners.delete(setFocus); }; }, []);
    useEffect(() => {
        if (data.user !== account) { loader.cancel(); onClose(); return; }
        refresh();
        if (!config.refreshAutomatically) return;
        const timer = setInterval(() => refresh(), 300_000);
        return () => clearInterval(timer);
    }, [config.refreshAutomatically, data.user]);

    function openEvent(occurrence: Occurrence) {
        if (occurrence.personal) {
            const saved = occurrence.personal;
            onClose();
            NavigationRouter.transitionTo(`/channels/${saved.guildId ?? "@me"}/${saved.channelId}/${saved.messageId}`);
            return;
        }
        showEvent({ eventId: occurrence.event.id, recurrenceId: occurrence.recurrenceId });
    }

    // Discord's modal layer has pointer-events: none; custom modal roots must opt back in.
    return <Dialog className="set-dialog" style={{ pointerEvents: "auto" }} aria-label={translator(resolveLanguage(config.language ?? "auto", data.discordLocale)).t("title")} aria-modal="true" onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }}><ErrorBoundary><Timeline
        {...data} load={load} duration={config.defaultDuration} recurrenceDates={recurrenceDates}
        personalEvents={data.user ? config.personalEvents?.[data.user] ?? [] : []} personalMinutes={config.personalMinutes ?? 60} focus={focus}
        onPersonalMinutes={minutes => { settings.store.personalMinutes = minutes; }}
        onEditPersonal={(id, minutes) => updateSaved(events => editPersonal(events, id, minutes))}
        onRemovePersonal={id => updateSaved(events => removePersonal(events, id))}
        hiddenGuilds={config.hiddenGuilds ?? []} initialView={config.view ?? "timeline"} initialZoom={config.zoom ?? 140}
        language={config.language ?? "auto"} onLanguageChange={language => { settings.store.language = language; }}
        onHiddenChange={ids => { settings.store.hiddenGuilds = ids; }}
        onViewChange={view => { settings.store.view = view; }} onZoomChange={zoom => { settings.store.zoom = zoom; }}
        onRefresh={() => refresh(true)} onEvent={openEvent} onClose={onClose}
        onGuild={guildId => { onClose(); NavigationRouter.transitionToGuild(guildId); }}
    /></ErrorBoundary></Dialog>;
}

function openTimeline(savedId?: string) {
    if (!enabled) return;
    focusRequest = savedId ? { id: savedId, nonce: ++focusNonce } : undefined;
    if (modalKey) { focusListeners.forEach(listener => listener(focusRequest)); return; }
    const currentAccount = UserStore.getCurrentUser()?.id;
    if (currentAccount !== account) loader.cancel();
    account = currentAccount;
    modalKey = openModal(props => <EventTimelineModal {...props} />, {
        modalKey: "ServerEventsTimeline",
        onCloseCallback: () => { modalKey = undefined; }
    });
}

function CalendarButton() {
    const { t } = useTranslation();
    return <div className="set-launcher"><button title={t("launcher")} aria-label={t("openTimeline")} onClick={() => openTimeline()}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M7 3v5M17 3v5M3 11h18M7 15h3M14 15h3M7 18h3" /></svg>
    </button></div>;
}

function useTranslation() {
    const config = settings.use(["language"]);
    const locale = useStateFromStores([LocaleStore], () => LocaleStore.locale);
    return translator(resolveLanguage(config.language ?? "auto", locale));
}

function SettingsAbout() {
    const { t } = useTranslation();
    return <div className="set-about"><p>{t("about")}</p><button onClick={() => openTimeline()}>{t("openTimeline")}</button></div>;
}

export default definePlugin({
    name: "ServerEventsTimeline",
    description: "A compact timeline of scheduled events from all your Discord servers, inspired by vrc.tl. Open it from the calendar button or /events-timeline.",
    authors: [{ name: "N1ades", id: 0n }],
    dependencies: ["ServerListAPI"],
    settings,
    contextMenus: { message: messageMenu },
    patches: [{
        find: "timestamp:{react:",
        replacement: {
            match: /timestamp:\{react:\((\i),(\i),(\i)\)=>(\(0,\i\.jsx\)\(\i\.\i,\{node:\1\},\3\.key\))/,
            replace: "timestamp:{react:($1,$2,$3)=>$self.renderTimestamp($1,$3,$4)"
        }
    }],
    renderTimestamp(node: { timestamp: string; }, state: { channelId?: string; messageId?: string; key?: string; }, native: ReactNode) {
        if (!enabled) return native;
        return <MessageTimestamp key={state.key} seconds={Number(node.timestamp)} state={state}>{native}</MessageTimestamp>;
    },
    commands: [{
        name: "events-timeline",
        description: "Open the shared event timeline for your servers",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: () => { openTimeline(); }
    }],
    settingsAboutComponent: SettingsAbout,
    start() {
        enabled = true;
        addServerListElement(ServerListRenderPosition.Above, CalendarButton);
    },
    stop() {
        enabled = false;
        loader.cancel();
        account = undefined;
        focusRequest = undefined;
        if (modalKey) closeModal(modalKey);
        removeServerListElement(ServerListRenderPosition.Above, CalendarButton);
    }
});
