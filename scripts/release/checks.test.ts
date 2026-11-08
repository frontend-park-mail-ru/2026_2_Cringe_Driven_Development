import { afterEach, expect, test } from 'bun:test';

// пауза между попытками читается при загрузке модуля
process.env.CHECK_INTERVAL_MS = '0';
process.env.HEALTH_WAIT_MS = '0';
const { health, releaseCheck } = await import('./checks.ts');

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

const SHA = 'a'.repeat(40);
const BASE = `https://cdn.test/releases/${SHA}/`;

function cdn(missing?: string): string[] {
    const requested: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        requested.push(url);
        if (url === `${BASE}index.html`) {
            return new Response(
                `<meta name="release" content="${SHA}"><script type="module" crossorigin src="${BASE}assets/index.js"></script><link rel="stylesheet" crossorigin href="${BASE}assets/index.css">`,
            );
        }
        if (url === missing) return new Response('', { status: 404 });
        return new Response('', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': url.endsWith('.css') ? 'text/css' : 'text/javascript',
            },
        });
    }) as typeof fetch;
    return requested;
}

test('release check проверяет все JS и CSS выпуска', async () => {
    process.env.CDN_URL = 'https://cdn.test';
    const requested = cdn();
    await releaseCheck(SHA);
    expect(requested).toContain(`${BASE}assets/index.js`);
    expect(requested).toContain(`${BASE}assets/index.css`);
});

test('release check не проходит без CSS на CDN', async () => {
    process.env.CDN_URL = 'https://cdn.test';
    cdn(`${BASE}assets/index.css`);
    await expect(releaseCheck(SHA)).rejects.toThrow('Release check не прошёл');
});

/** Прод с настоящими ответами всех проверок; подменяются ответ входа и тип ассетов. */
function site(login: () => Response | Promise<Response>, assetType?: string | null): RequestInit[] {
    const logins: RequestInit[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://site.test/login') {
            return new Response(
                `<meta name="release" content="${SHA}"><script id="bootstrap" type="application/json">{"user":null}</script><script type="module" crossorigin src="${BASE}a.js"></script><link rel="stylesheet" crossorigin href="${BASE}a.css">`,
                { headers: { 'Cache-Control': 'private, no-store' } },
            );
        }
        if (url.startsWith(BASE)) {
            const type =
                assetType === undefined
                    ? url.endsWith('.css')
                        ? 'text/css; charset=utf-8'
                        : 'application/javascript; charset=utf-8'
                    : assetType;
            const res = new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
            if (type) res.headers.set('Content-Type', type);
            return res;
        }
        if (url.endsWith('/api/trpc/users.me')) {
            return Response.json({ error: { data: { code: 'UNAUTHORIZED' } } }, { status: 401 });
        }
        if (url.endsWith('/api/unknown')) return new Response('', { status: 404 });
        if (url.endsWith('/api/trpc/auth.login')) {
            logins.push(init ?? {});
            return login();
        }
        throw new Error(`неожиданный запрос ${url}`);
    }) as typeof fetch;
    return logins;
}

const rpcError = (status: number, code: string, appCode?: string) => () =>
    Response.json({ error: { data: { code, appCode } } }, { status });
const rejected = rpcError(400, 'BAD_REQUEST', 'invalid_credentials');

function prodEnv(): void {
    process.env.CDN_URL = 'https://cdn.test';
    process.env.SITE_URL = 'https://site.test';
}

test('health принимает отказ Go и шлёт случайный вход без cookie', async () => {
    prodEnv();
    const logins = site(rejected);
    await health(SHA);
    const { method, headers, body } = logins[0]!;
    expect(method).toBe('POST');
    expect(headers).toEqual({
        'Content-Type': 'application/json',
        'X-CSRF': '1',
        Origin: 'https://site.test',
    });
    const input = JSON.parse(String(body)) as { login: string; password: string };
    expect(input.login).toMatch(/^[a-zA-Z0-9_]{3,32}$/);
    expect(input.password.length).toBeGreaterThanOrEqual(8);
});

test.each([
    ['локальный отказ BFF без Go', rpcError(403, 'FORBIDDEN', 'csrf_invalid')],
    ['ошибка схемы', rpcError(400, 'BAD_REQUEST')],
    ['неверный S2S-ключ', rpcError(502, 'BAD_GATEWAY', 's2s_forbidden')],
    ['Go недоступен', rpcError(502, 'BAD_GATEWAY')],
    ['401 без машинного кода', rpcError(401, 'UNAUTHORIZED')],
    [
        'invalid_credentials не со статусом 400',
        rpcError(401, 'UNAUTHORIZED', 'invalid_credentials'),
    ],
    ['успешный вход', () => Response.json({ result: { data: {} } })],
    ['ответ не JSON', () => new Response('<html>', { status: 401 })],
    ['таймаут', () => Promise.reject(new DOMException('The operation timed out', 'TimeoutError'))],
])('health не проходит: %s', async (_name, login) => {
    prodEnv();
    site(login);
    await expect(health(SHA)).rejects.toThrow('Health check не прошёл');
});

test.each([
    ['HTML с 200', 'text/html; charset=utf-8'],
    ['нет типа', null],
])('health и release check не принимают ассет: %s', async (_name, type) => {
    prodEnv();
    site(rejected, type);
    await expect(health(SHA)).rejects.toThrow('Health check не прошёл');

    const fetchAsset = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
        String(input) === `${BASE}index.html`
            ? new Response(
                  `<meta name="release" content="${SHA}"><script src="${BASE}a.js"></script><link href="${BASE}a.css">`,
              )
            : fetchAsset(input, init)) as typeof fetch;
    await expect(releaseCheck(SHA)).rejects.toThrow('Release check не прошёл');
});

test('CSS с типом JS не проходит', async () => {
    prodEnv();
    site(rejected, 'text/javascript');
    await expect(health(SHA)).rejects.toThrow('Health check не прошёл');
});
