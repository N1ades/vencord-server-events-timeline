/*
 * Vencord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

if (typeof browser === "undefined") {
    var browser = chrome;
}

if (window === window.top) {
    const launchHash = "#server-events-timeline";
    let launchObserver;

    window.addEventListener("message", event => {
        if (event.source !== window || event.origin !== location.origin) return;
        if (event.data?.type === "set:publish") {
            void browser.runtime.sendMessage({ action: "timelinePublish", guilds: event.data.guilds, entries: event.data.entries }).catch(() => {});
        } else if (event.data?.type === "set:options") {
            void browser.runtime.sendMessage({ action: "timelineOptions" }).catch(() => {});
        }
    });

    function openEventsTimeline() {
        if (launchObserver) return;

        function clickCalendar() {
            const button = document.querySelector(".set-launcher button");
            if (!button) return false;
            button.click();
            return true;
        }

        if (clickCalendar()) return;

        const observer = new MutationObserver(() => {
            if (clickCalendar()) stopWaiting();
        });
        const timeout = setTimeout(stopWaiting, 30000);
        launchObserver = observer;
        observer.observe(document, { childList: true, subtree: true });

        function stopWaiting() {
            clearTimeout(timeout);
            observer.disconnect();
            launchObserver = undefined;
        }
    }

    browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request.action !== "openEventsTimeline") return;
        openEventsTimeline();
        sendResponse(true);
    });

    if (location.hash === launchHash) {
        history.replaceState(history.state, "", location.pathname + location.search);
        openEventsTimeline();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        window.postMessage({
            type: "vencord:meta",
            meta: {
                EXTENSION_VERSION: browser.runtime.getManifest().version,
                EXTENSION_BASE_URL: browser.runtime.getURL(""),
                RENDERER_CSS_URL: browser.runtime.getURL("dist/Vencord.css"),
            }
        });

        chrome.runtime.onMessage.addListener(request => {
            window.postMessage({ type: "vencord:keybinds", meta: request.command });
        });

        window.addEventListener("message", function(event) {
            if (event.source !== window) return;

            if (event.data.type === "OPEN_SHORTCUTS") {
            chrome.runtime.sendMessage({ action: "openShortcuts" });
            }
        }, false);
    },
    { once: true }
);
