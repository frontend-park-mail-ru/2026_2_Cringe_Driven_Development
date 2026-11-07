// Go с управляемыми ответами: подменяет fetch, которым ходит bearerFetch. Пути — без /api/v1.
import { spyOn } from 'bun:test';

/** Один вызов Go: что пришло от BFF. */
export type GoCall = {
    method: string;
    path: string;
    search: string;
    headers: Headers;
    body: unknown;
};

/** Обработчик маршрута фейкового Go. */
export type GoRoute = (call: GoCall, signal?: AbortSignal | null) => Response | Promise<Response>;

/**
 * Подменяет `fetch` фейковым Go. Маршрут — `"METHOD /path"`, сегмент `:x` — любой.
 * @param routes обработчики маршрутов
 * @returns журнал вызовов и `restore` — вернуть настоящий `fetch`
 */
export function fakeGo(routes: Record<string, GoRoute>): { calls: GoCall[]; restore(): void } {
    const calls: GoCall[] = [];
    const table = Object.entries(routes).map(([key, route]) => {
        const [method, pattern] = key.split(' ') as [string, string];
        const re = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`);
        return { method, re, route };
    });
    const spy = spyOn(globalThis, 'fetch').mockImplementation((async (
        input: string | URL | Request,
        init?: RequestInit,
    ) => {
        const url = new URL(String(input));
        const path = url.pathname.replace(/^\/api\/v1/, '');
        const method = init?.method ?? 'GET';
        const text = typeof init?.body === 'string' ? init.body : '';
        const form = init?.body instanceof FormData ? init.body : undefined;
        const call = {
            method,
            path,
            search: url.search,
            headers: new Headers(init?.headers),
            body: form ?? (text ? JSON.parse(text) : undefined),
        };
        calls.push(call);
        const hit = table.find((r) => r.method === method && r.re.test(path));
        if (!hit) return Response.json({ code: 'not_found', message: path }, { status: 404 });
        return hit.route(call, init?.signal);
    }) as unknown as typeof fetch);
    return { calls, restore: () => spy.mockRestore() };
}

/** Ответ `Error` контракта Go. */
export const goError = (status: number, code: string): Response =>
    Response.json({ code, message: code }, { status });

/** Ответ, который не приходит, пока BFF не оборвёт запрос по таймауту. */
export const hang: GoRoute = (_call, signal) =>
    new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason));
    });

const token = (call: GoCall): string =>
    (call.body as { refresh_token?: string } | undefined)?.refresh_token ?? '';

/**
 * Токены Go с ротацией: refresh-токен действует один раз, после logout — отозван.
 * @returns выдача пары и маршруты `POST /auth/refresh`, `POST /auth/logout`
 */
export function goTokens(): {
    issue(): {
        access_token: string;
        access_expires_in: number;
        refresh_token: string;
        refresh_expires_in: number;
    };
    routes: Record<string, GoRoute>;
} {
    let n = 0;
    const live = new Set<string>();
    const prefix = crypto.randomUUID().slice(0, 8);
    const issue = () => {
        n++;
        const pair = {
            access_token: `${prefix}-access-${n}`,
            access_expires_in: 900,
            refresh_token: `${prefix}-refresh-${n}`,
            refresh_expires_in: 3600,
        };
        live.add(pair.refresh_token);
        return pair;
    };
    return {
        issue,
        routes: {
            'POST /auth/refresh': (call) => {
                if (!live.delete(token(call))) return goError(401, 'unauthorized');
                return Response.json(issue());
            },
            'POST /auth/logout': (call) => {
                live.delete(token(call));
                return new Response(null, { status: 204 });
            },
        },
    };
}
