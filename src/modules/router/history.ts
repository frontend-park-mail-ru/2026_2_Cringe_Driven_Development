export interface HistoryLocation {
    pathname: string;
    search: string;
    hash: string;
    state: unknown;
}

export interface RouterHistory {
    readonly location: HistoryLocation;
    push(href: string, state?: unknown): void;
    replace(href: string, state?: unknown): void;
    go(delta: number): void;
    back(): void;
    forward(): void;
    /** Слушатель вызывается только при переходах по истории (назад/вперёд), но не при push/replace */
    subscribe(listener: () => void): () => void;
}

export function createBrowserHistory(): RouterHistory {
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((listener) => listener());

    return {
        get location() {
            const { pathname, search, hash } = window.location;
            return { pathname, search, hash, state: window.history.state };
        },
        push: (href, state) => window.history.pushState(state ?? null, '', href),
        replace: (href, state) => window.history.replaceState(state ?? null, '', href),
        go: (delta) => window.history.go(delta),
        back: () => window.history.back(),
        forward: () => window.history.forward(),
        subscribe(listener) {
            if (listeners.size === 0) window.addEventListener('popstate', notify);
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) window.removeEventListener('popstate', notify);
            };
        },
    };
}

export interface MemoryHistoryOptions {
    initialEntries?: string[];
    initialIndex?: number;
}

/** История в памяти: для тестов и окружений без `window` */
export function createMemoryHistory(options: MemoryHistoryOptions = {}): RouterHistory {
    const entries = (options.initialEntries ?? ['/']).map((href) => parseHref(href, null));
    const listeners = new Set<() => void>();
    let index = clamp(options.initialIndex ?? entries.length - 1, 0, entries.length - 1);

    const go = (delta: number) => {
        const nextIndex = clamp(index + delta, 0, entries.length - 1);
        if (nextIndex === index) return;
        index = nextIndex;
        listeners.forEach((listener) => listener());
    };

    return {
        get location() {
            return entries[index]!;
        },
        push(href, state) {
            index += 1;
            entries.splice(index, entries.length - index, parseHref(href, state ?? null));
        },
        replace(href, state) {
            entries[index] = parseHref(href, state ?? null);
        },
        go,
        back: () => go(-1),
        forward: () => go(1),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

function parseHref(href: string, state: unknown): HistoryLocation {
    const { pathname, search, hash } = new URL(href, 'http://localhost');
    return { pathname, search, hash, state };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
