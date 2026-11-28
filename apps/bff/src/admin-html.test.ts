// HTML админки OnlineConf (frontend#316): роль проверяется до выдачи HTML. Go — локальная заглушка.
import { afterAll, beforeAll, expect, test } from 'bun:test';

/** Ответ OnlineConf `GET /admin/access` по access-токену сессии */
const ACCESS: Record<string, () => Response> = {
    admin: () => new Response(null, { status: 204 }),
    user: () => Response.json({ code: 'forbidden', message: 'role required' }, { status: 403 }),
    s2s: () => Response.json({ code: 's2s_forbidden', message: 'key' }, { status: 403 }),
    down: () => Response.json({ code: 'unavailable', message: 'down' }, { status: 503 }),
    expired: () => Response.json({ code: 'unauthorized', message: 'session' }, { status: 401 }),
    // `users/me` отвечает, а проверка роли получает 401 и refresh не удаётся
    lost: () => Response.json({ code: 'unauthorized', message: 'session' }, { status: 401 }),
};
const accessCalls: string[] = [];

const go = Bun.serve({
    port: 0,
    fetch(req) {
        const { pathname } = new URL(req.url);
        const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
        if (pathname === '/oc/admin/access') {
            accessCalls.push(token);
            return (ACCESS[token] ?? ACCESS.down!)();
        }
        if (pathname === '/identity/users/me') {
            if (token === 'expired') return new Response(null, { status: 401 });
            return Response.json({ id: 1, login: 'u', avatar_url: null, has_2fa: false });
        }
        if (pathname === '/identity/auth/refresh') return new Response(null, { status: 401 });
        return new Response(null, { status: 404 });
    },
});

process.env.SESSION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.APP_ORIGIN = 'https://app.test';
process.env.IDENTITY_API_URL = `http://127.0.0.1:${go.port}/identity`;
process.env.WORKSPACE_API_URL = `http://127.0.0.1:${go.port}/workspace`;
process.env.ONLINECONF_API_URL = `http://127.0.0.1:${go.port}/oc`;

const { createBff } = await import('./bff.ts');
const { sealSession } = await import('./session/crypto.ts');
const { SESSION_COOKIE } = await import('./session/cookies.ts');

const ADMIN_HTML = '<!doctype html><html><body><div id="onlineconf-admin"></div></body></html>';
const PRODUCT_HTML =
    '<!doctype html><html><body><script id="bootstrap" type="application/json"></script></body></html>';
// через Bun.serve: HEAD без тела отдаёт сервер, как на проде
const bff = Bun.serve({ port: 0, ...createBff(PRODUCT_HTML, new Map(), ADMIN_HTML) });
const ADMIN_PATHS = ['/onlineconf', '/onlineconf/', '/onlineconf/keys'];

const cookies: Record<string, string> = {};
beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const token of Object.keys(ACCESS)) {
        const value = await sealSession({
            access: token,
            refresh: 'r',
            accessExp: now + 3600,
            refreshExp: now + 7200,
        });
        cookies[token] = `${SESSION_COOKIE}=${value}`;
    }
});
afterAll(() => {
    void go.stop(true);
    void bff.stop(true);
});

const open = (path: string, session?: string, method = 'GET'): Promise<Response> =>
    fetch(`http://127.0.0.1:${bff.port}${path}`, {
        method,
        redirect: 'manual',
        headers: { Accept: 'text/html', ...(session ? { Cookie: cookies[session]! } : {}) },
    });

/** Статус, `Location` и признак удаления cookie сессии — то, что сравнивается с неизвестным адресом */
const shape = (res: Response) => ({
    status: res.status,
    location: res.headers.get('Location'),
    clears: res.headers.getSetCookie().some((c) => c.includes('Max-Age=0')),
});

test('гость и пользователь без роли получают тот же ответ, что на неизвестный адрес', async () => {
    for (const session of [undefined, 'user', 'expired']) {
        const unknown = shape(await open('/no-such-page', session));
        for (const path of ADMIN_PATHS) {
            const res = await open(path, session);
            expect(shape(res)).toEqual(unknown);
            const body = await res.text();
            expect(body).not.toContain('onlineconf');
            expect(res.headers.get('Location') ?? '').not.toContain('onlineconf');
        }
    }
    expect(shape(await open('/onlineconf/keys'))).toEqual({
        status: 302,
        location: '/login',
        clears: false,
    });
    // отказ по роли — на главную, сессия не завершается
    expect(shape(await open('/onlineconf/keys', 'user'))).toEqual({
        status: 302,
        location: '/',
        clears: false,
    });
    expect(shape(await open('/onlineconf/keys', 'expired'))).toMatchObject({
        location: '/login',
        clears: true,
    });
});

test('без сессии OnlineConf не вызывается', async () => {
    accessCalls.length = 0;
    for (const path of ADMIN_PATHS) await open(path);
    expect(accessCalls).toEqual([]);
});

test('администратор получает админку без кеширования, следующий гость — нет', async () => {
    for (const path of ADMIN_PATHS) {
        const res = await open(path, 'admin');
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await res.text()).toBe(ADMIN_HTML);
        const guest = await open(path);
        expect(guest.status).toBe(302);
        expect(await guest.text()).toBe('');
    }
});

test('сбой проверки и отказ по ключу BFF — 503 без админки и без сброса сессии', async () => {
    for (const session of ['down', 's2s']) {
        const res = await open('/onlineconf/keys', session);
        expect(shape(res)).toEqual({ status: 503, location: null, clears: false });
        expect(await res.text()).not.toContain('onlineconf-admin');
    }
});

test('HEAD повторяет статус и заголовки GET без тела', async () => {
    for (const session of [undefined, 'user', 'admin', 'down']) {
        const get = await open('/onlineconf/keys', session);
        const head = await open('/onlineconf/keys', session, 'HEAD');
        expect(shape(head)).toEqual(shape(get));
        expect(head.headers.get('Cache-Control')).toBe(get.headers.get('Cache-Control'));
        expect(head.headers.get('Content-Type')).toBe(get.headers.get('Content-Type'));
        expect(await head.text()).toBe('');
    }
});

test('API OnlineConf остаётся JSON и не становится HTML-редиректом', async () => {
    const res = await open('/api/onlineconf/unknown');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
});

test('users/me: isAdmin по роли OnlineConf, сбой проверки — false', async () => {
    for (const [session, isAdmin] of [
        ['admin', true],
        ['user', false],
        ['down', false],
    ] as const) {
        const res = await fetch(`http://127.0.0.1:${bff.port}/api/users/me`, {
            headers: { 'X-CSRF': '1', Cookie: cookies[session]! },
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ login: 'u', isAdmin });
    }
});

test('users/me: конец сессии при проверке роли — 401 и удаление cookie, а не isAdmin: false', async () => {
    const res = await fetch(`http://127.0.0.1:${bff.port}/api/users/me`, {
        headers: { 'X-CSRF': '1', Cookie: cookies.lost! },
    });
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((c) => c.includes('Max-Age=0'))).toBe(true);
});
