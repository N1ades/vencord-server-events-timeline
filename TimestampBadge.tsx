/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function TimestampBadge({ label, onOpen }: { label: string; onOpen(): void; }) {
    return <button className="set-timestamp-badge" title={label} aria-label={label} onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
    }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M7 3v5M17 3v5M3 11h18M7 15h3M14 15h3" /></svg></button>;
}
