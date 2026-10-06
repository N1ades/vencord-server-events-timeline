/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { LocaleStore } from "@webpack/common";

import { languages, resolveLanguage, translator } from "./i18n";

function settingTranslation() {
    const choice = settings.pluginName ? settings.store.language ?? "auto" : "auto";
    return translator(resolveLanguage(choice, LocaleStore?.locale ?? "en"));
}

export const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        get description() { return settingTranslation().t("language"); },
        options: [{ get label() { return settingTranslation().t("auto"); }, value: "auto", default: true }, ...languages.map(({ label, value }) => ({ label, value }))]
    },
    defaultDuration: {
        type: OptionType.SELECT,
        get description() { return settingTranslation().t("durationSetting"); },
        options: [
            { get label() { return settingTranslation().t("durationHours", { hours: 1 }); }, value: 1 },
            { get label() { return settingTranslation().t("durationHours", { hours: 2 }); }, value: 2, default: true },
            { get label() { return settingTranslation().t("durationHours", { hours: 4 }); }, value: 4 }
        ]
    },
    refreshAutomatically: { type: OptionType.BOOLEAN, get description() { return settingTranslation().t("refreshSetting"); }, default: true }
}).withPrivateSettings<{ hiddenGuilds?: string[]; view?: "timeline" | "list"; zoom?: number; }>();
