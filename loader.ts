/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface LoadState {
    loading: boolean;
    done: number;
    total: number;
    errors: string[];
    updated: number | null;
}

/** One serial queue shared by all views; native Discord requests handle rate limits. */
export class EventLoader {
    state: LoadState = { loading: false, done: 0, total: 0, errors: [], updated: null };
    private listeners = new Set<() => void>();
    private fetched = new Map<string, number>();
    private generation = 0;
    private pending: Promise<void> | undefined;
    private pendingGeneration = 0;

    constructor(private fetchGuild: (id: string) => Promise<unknown>, private valid: () => boolean, private delay = 300) { }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private update(values: Partial<LoadState>) {
        this.state = { ...this.state, ...values };
        this.listeners.forEach(listener => listener());
    }

    refresh(ids: string[], force = false): Promise<void> {
        if (this.pending) return this.pendingGeneration === this.generation ? this.pending : this.pending.then(() => this.refresh(ids, force));
        if (!this.valid()) return Promise.resolve();
        const remaining = [...new Set(ids)].filter(id => force || Date.now() - (this.fetched.get(id) ?? 0) >= 300_000);
        if (!remaining.length) return Promise.resolve();
        const { generation } = this;
        this.pendingGeneration = generation;
        this.update({ loading: true, done: 0, total: remaining.length, errors: [] });
        this.pending = this.run(remaining, generation).finally(() => {
            this.pending = undefined;
            if (generation === this.generation) this.update({ loading: false, updated: Date.now() });
        });
        return this.pending;
    }

    private async run(ids: string[], generation: number) {
        for (let i = 0; i < ids.length; i++) {
            if (generation !== this.generation || !this.valid()) break;
            try {
                await this.fetchGuild(ids[i]);
                if (generation !== this.generation || !this.valid()) break;
                this.fetched.set(ids[i], Date.now());
            } catch {
                if (generation !== this.generation) break;
                this.update({ errors: [...this.state.errors, ids[i]] });
            }
            this.update({ done: i + 1 });
            if (i + 1 < ids.length && this.delay) await new Promise(resolve => setTimeout(resolve, this.delay));
        }
    }

    cancel() {
        this.generation++;
        this.fetched.clear();
        this.update({ loading: false, updated: null, errors: [], done: 0, total: 0 });
    }
}
