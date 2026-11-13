/// <reference types="bun" />
import { afterEach, expect, test } from 'bun:test';

process.env.SESSION_KEY = Buffer.alloc(32).toString('base64');
process.env.APP_ORIGIN = 'https://app.test';
process.env.GO_API_URL = 'https://go.test';

const { createGo } = await import('./api.ts');
type Sess = Parameters<typeof createGo>[0];

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

/** Сессия-заглушка: `call` просто вызывает операцию. */
const session = { call: (fn: (init: RequestInit) => Promise<unknown>) => fn({}) } as Sess;

/** Подменяет сеть: ответ 200 с телом, адрес запроса пишется в `urls`. */
function respond(body: unknown): string[] {
    const urls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        urls.push(String(input));
        return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    return urls;
}

test('принимает объект страницы Go, в том числе пустой', async () => {
    const page = { items: [], next_cursor: null, matched_count: 0, total_count: 0 };
    respond(page);
    expect(await createGo(session).listNotebooks()).toEqual(page);
});

test('передаёт limit и cursor в Go', async () => {
    const urls = respond({ items: [], next_cursor: null, matched_count: 0, total_count: 0 });
    await createGo(session).listNotebooks({ limit: 24, cursor: 'abc' });
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe('/notebooks');
    expect(url.searchParams.get('limit')).toBe('24');
    expect(url.searchParams.get('cursor')).toBe('abc');
});

test('массив вместо страницы — ответ не по контракту', async () => {
    respond([]);
    await expect(createGo(session).listNotebooks()).rejects.toMatchObject({
        kind: 'unexpected',
    });
});
