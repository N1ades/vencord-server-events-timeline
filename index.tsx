/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ApplicationCommandInputType } from "@api/Commands";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import type { GuildScheduledEventRecurrenceRule, RenderModalProps } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { ChannelStore, closeModal, Dialog, GuildScheduledEventStore, GuildStore, LocaleStore, NavigationRouter, openModal, PermissionsBits, PermissionStore, useEffect, UserStore,useState, useStateFromStores } from "@webpack/common";

import { Occurrence } from "./core";
import { resolveLanguage, translator } from "./i18n";
import { EventLoader } from "./loader";
import { settings } from "./settings";
import { Timeline } from "./Timeline";

const EventActions = findByPropsLazy("fetchGuildEventsForGuild") as { fetchGuildEventsForGuild(id: string): Promise<unknown>; };
const toRRule = findByCodeLazy(".byNWeekday", "byweekday:") as (rule: GuildScheduledEventRecurrenceRule) => { between(from: Date, to: Date, inclusive: boolean, iterator: (date: Date, index: number) => boolean): Date[]; };
const showEvent = findByCodeLazy("guildScheduledEventId:", "initialRecurrenceId:") as (props: { eventId: string; recurrenceId: string | null; }) => void;

let enabled = false;
let account: string | undefined;
let modalKey: string | undefined;
const loader = new EventLoader(id => EventActions.fetchGuildEventsForGuild(id), () => enabled && account === UserStore.getCurrentUser()?.id);

function recurrenceDates(rule: GuildScheduledEventRecurrenceRule, from: Date, to: Date) {
    // Discord uses rrule itself; reuse it for monthly, yearly, weekday and nth-weekday rules.
    return toRRule(rule).between(from, to, true, (_, index) => index < 1000);
}

function EventTimelineModal({ onClose }: RenderModalProps) {
    const config = settings.use(["defaultDuration", "hiddenGuilds", "view", "zoom", "refreshAutomatically", "language"]);
    const [load, setLoad] = useState(loader.state);
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
    useEffect(() => {
        if (data.user !== account) { loader.cancel(); onClose(); return; }
        refresh();
        if (!config.refreshAutomatically) return;
        const timer = setInterval(() => refresh(), 300_000);
        return () => clearInterval(timer);
    }, [config.refreshAutomatically, data.user]);

    function openEvent(occurrence: Occurrence) {
        showEvent({ eventId: occurrence.event.id, recurrenceId: occurrence.recurrenceId });
    }

    // Discord's modal layer has pointer-events: none; custom modal roots must opt back in.
    return <Dialog className="set-dialog" style={{ pointerEvents: "auto" }} aria-label={translator(resolveLanguage(config.language ?? "auto", data.discordLocale)).t("title")} aria-modal="true" onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }}><ErrorBoundary><Timeline
        {...data} load={load} duration={config.defaultDuration} recurrenceDates={recurrenceDates}
        hiddenGuilds={config.hiddenGuilds ?? []} initialView={config.view ?? "timeline"} initialZoom={config.zoom ?? 140}
        language={config.language ?? "auto"} onLanguageChange={language => { settings.store.language = language; }}
        onHiddenChange={ids => { settings.store.hiddenGuilds = ids; }}
        onViewChange={view => { settings.store.view = view; }} onZoomChange={zoom => { settings.store.zoom = zoom; }}
        onRefresh={() => refresh(true)} onEvent={openEvent} onClose={onClose}
        onGuild={guildId => { onClose(); NavigationRouter.transitionToGuild(guildId); }}
    /></ErrorBoundary></Dialog>;
}

function openTimeline() {
    if (!enabled || modalKey) return;
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
    return <div className="set-launcher"><button title={t("launcher")} aria-label={t("openTimeline")} onClick={openTimeline}>
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
    return <div className="set-about"><p>{t("about")}</p><button onClick={openTimeline}>{t("openTimeline")}</button></div>;
}

export default definePlugin({
    name: "ServerEventsTimeline",
    description: "A compact timeline of scheduled events from all your Discord servers, inspired by vrc.tl. Open it from the calendar button or /events-timeline.",
    authors: [{ name: "N1ades", id: 0n }],
    dependencies: ["ServerListAPI"],
    settings,
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
        if (modalKey) closeModal(modalKey);
        removeServerListElement(ServerListRenderPosition.Above, CalendarButton);
    }
});
