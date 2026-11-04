// Сценарии BFF против Go с управляемыми ответами (test/fake-go.ts): через весь обработчик —
// Hono, CSRF, tRPC, сессию, HTML — без сервера и сети.
import { afterEach, describe, expect, test } from 'bun:test';

import { createBff } from '../src/bff.ts';
import { renderBootstrap } from '../src/html.ts';
import { SESSION_COOKIE } from '../src/session/cookies.ts';
import { sealSession } from '../src/session/crypto.ts';
import { loadTemplate } from '../src/template.ts';
import { type GoRoute, fakeGo, goError, goTokens, hang } from './fake-go.ts';

const ORIGIN = 'http://localhost:3000';
const RPC = {
    'X-CSRF': '1',
    Origin: ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
    'Content-Type': 'application/json',
};
const USER = { id: 1, login: 'denis', avatar_url: null };
const template = await loadTemplate(process.env.HTML_TEMPLATE ?? '');
const bff = createBff(template, new Map());

let go: ReturnType<typeof fakeGo> | undefined;
afterEach(() => go?.restore());
const useGo = (routes: Record<string, GoRoute>) => (go = fakeGo(routes));

const now = (): number => Math.floor(Date.now() / 1000);

/** Cookie сессии с токенами из Go; access по умолчанию свежий (без refresh перед вызовом). */
async function cookie(
    tokens: { access_token: string; refresh_token: string },
    accessExp = now() + 900,
    refreshExp = now() + 3600,
): Promise<string> {
    return sealSession({
        access: tokens.access_token,
        refresh: tokens.refresh_token,
        accessExp,
        refreshExp,
    });
}

function rpc(
    proc: string,
    opts: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
) {
    const post = opts.body !== undefined;
    const headers: Record<string, string> = { ...RPC, ...opts.headers };
    if (opts.cookie) headers.Cookie = `${SESSION_COOKIE}=${opts.cookie}`;
    return bff(
        new Request(`${ORIGIN}/api/trpc/${proc}`, {
            method: post ? 'POST' : 'GET',
            headers,
            body: post ? JSON.stringify(opts.body) : undefined,
        }),
    );
}

function page(sessionCookie?: string, path = '/notebooks/1') {
    const headers: Record<string, string> = { Accept: 'text/html' };
    if (sessionCookie) headers.Cookie = `${SESSION_COOKIE}=${sessionCookie}`;
    return bff(new Request(`${ORIGIN}${path}`, { headers }));
}

const sessionSetCookie = (res: Response): string | undefined =>
    res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
const newSession = (res: Response): string | undefined => {
    const c = sessionSetCookie(res);
    const value = c?.split(';')[0]?.slice(SESSION_COOKIE.length + 1);
    return value || undefined;
};
const cleared = (res: Response): boolean => /Max-Age=0/.test(sessionSetCookie(res) ?? '');
const errorOf = async (res: Response) =>
    ((await res.json()) as { error: { data: unknown } }).error.data as {
        code: string;
        appCode?: string;
        zodError?: { fieldErrors: Record<string, string[]> };
    };
const bootstrap = async (res: Response) =>
    JSON.parse(
        /<script id="bootstrap" type="application\/json">(.*?)<\/script>/s.exec(
            await res.text(),
        )?.[1] ?? 'null',
    );
const goPaths = () => go?.calls.map((c) => `${c.method} ${c.path}`) ?? [];

describe('RPC', () => {
    test('login: клиенту только пользователь, токены — в cookie сессии, заголовки браузера в Go не уходят', async () => {
        const tokens = goTokens();
        useGo({ 'POST /auth/login': () => Response.json({ user: USER, tokens: tokens.issue() }) });
        const res = await rpc('auth.login', {
            body: { login: 'denis', password: 'password123' },
            headers: { Cookie: 'other=1', 'X-Request-ID': 'req-1' },
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(JSON.parse(text).result.data).toEqual(USER);
        expect(text).not.toContain('token');
        expect(sessionSetCookie(res)).toMatch(
            /Max-Age=3600; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
        );
        const legacy = res.headers.getSetCookie().filter((c) => !c.startsWith(SESSION_COOKIE));
        expect(legacy.map((c) => c.split('=')[0])).toEqual([
            'access_token',
            'refresh_token',
            '__Host-csrf',
        ]);
        const call = go?.calls[0];
        expect(call?.headers.get('X-Request-ID')).toBe('req-1');
        expect(call?.headers.has('Cookie')).toBe(false);
        expect(call?.headers.has('X-CSRF')).toBe(false);
    });

    test('без сессии — UNAUTHORIZED, Go не вызывается', async () => {
        useGo({});
        const res = await rpc('notebooks.list');
        expect(res.status).toBe(401);
        expect(go?.calls).toHaveLength(0);
    });

    test.each([
        ['без X-CSRF', 'notebooks.list', { 'X-CSRF': '' }],
        ['чужой Origin', 'notebooks.create', { Origin: 'https://evil.example' }],
        ['без Origin', 'notebooks.create', { Origin: '' }],
        ['Origin: null', 'notebooks.create', { Origin: 'null' }],
        ['Origin со слэшем', 'notebooks.create', { Origin: `${ORIGIN}/` }],
        ['Sec-Fetch-Site: same-site', 'notebooks.create', { 'Sec-Fetch-Site': 'same-site' }],
    ])('CSRF: %s — FORBIDDEN csrf_invalid, Go не вызывается', async (_name, proc, headers) => {
        useGo({});
        const tokens = goTokens();
        const clean = Object.fromEntries(
            Object.entries(headers).filter(([, v]) => v !== ''),
        ) as Record<string, string>;
        const req = new Request(`${ORIGIN}/api/trpc/${proc}`, {
            method: proc === 'notebooks.list' ? 'GET' : 'POST',
            headers: {
                ...Object.fromEntries(Object.entries(RPC).filter(([k]) => !(k in headers))),
                ...clean,
                Cookie: `${SESSION_COOKIE}=${await cookie(tokens.issue())}`,
            },
            body: proc === 'notebooks.list' ? undefined : JSON.stringify({ name: 'x' }),
        });
        const res = await bff(req);
        expect(res.status).toBe(403);
        expect((await errorOf(res)).appCode).toBe('csrf_invalid');
        expect(go?.calls).toHaveLength(0);
    });

    test('неверный вход — BAD_REQUEST с ошибками полей', async () => {
        useGo({});
        const res = await rpc('auth.login', { body: { login: 'denis', password: 'abc' } });
        expect(res.status).toBe(400);
        expect(Object.keys((await errorOf(res)).zodError?.fieldErrors ?? {})).toContain('password');
    });

    test('три запроса со старой cookie — один refresh, у всех новая сессия', async () => {
        const tokens = goTokens();
        useGo({ ...tokens.routes, 'GET /notebooks': () => Response.json([]) });
        const old = await cookie(tokens.issue(), now() - 1);
        const res = await Promise.all([1, 2, 3].map(() => rpc('notebooks.list', { cookie: old })));
        expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
        expect(goPaths().filter((p) => p === 'POST /auth/refresh')).toHaveLength(1);
        expect(res.every((r) => newSession(r))).toBe(true);
    });

    test('батч после истечения access: оба результата, одна Set-Cookie сессии', async () => {
        const tokens = goTokens();
        useGo({
            ...tokens.routes,
            'GET /users/me': () => Response.json(USER),
            'GET /notebooks': () => Response.json([]),
        });
        const old = await cookie(tokens.issue(), now() - 1);
        const res = await rpc(`users.me,notebooks.list?batch=1&input=${encodeURIComponent('{}')}`, {
            cookie: old,
        });
        const body = (await res.json()) as unknown[];
        expect(body.every((r) => 'result' in (r as object))).toBe(true);
        expect(res.headers.getSetCookie().filter((c) => c.startsWith(SESSION_COOKIE))).toHaveLength(
            1,
        );
        expect(goPaths().filter((p) => p === 'POST /auth/refresh')).toHaveLength(1);
    });

    test('401 от Go — refresh и один повтор; повторный 401 завершает сессию', async () => {
        const tokens = goTokens();
        useGo({ ...tokens.routes, 'GET /notebooks': () => goError(401, 'unauthorized') });
        const res = await rpc('notebooks.list', { cookie: await cookie(tokens.issue()) });
        expect(res.status).toBe(401);
        expect(goPaths()).toEqual(['GET /notebooks', 'POST /auth/refresh', 'GET /notebooks']);
        expect(cleared(res)).toBe(true);
    });

    test('отказ refresh — UNAUTHORIZED и удаление cookie', async () => {
        useGo({ 'POST /auth/refresh': () => goError(401, 'unauthorized') });
        const res = await rpc('notebooks.list', {
            cookie: await cookie(goTokens().issue(), now() - 1),
        });
        expect(res.status).toBe(401);
        expect(cleared(res)).toBe(true);
    });

    test('403 s2s_forbidden на refresh — BAD_GATEWAY, сессия не трогается, повторов нет', async () => {
        useGo({ 'POST /auth/refresh': () => goError(403, 's2s_forbidden') });
        const res = await rpc('notebooks.list', {
            cookie: await cookie(goTokens().issue(), now() - 1),
        });
        expect(res.status).toBe(502);
        expect((await errorOf(res)).appCode).toBe('s2s_forbidden');
        expect(sessionSetCookie(res)).toBeUndefined();
        expect(go?.calls).toHaveLength(1);
    });

    test('5xx Go — BAD_GATEWAY, cookie не меняется', async () => {
        useGo({ 'GET /notebooks': () => goError(500, 'internal') });
        const res = await rpc('notebooks.list', { cookie: await cookie(goTokens().issue()) });
        expect(res.status).toBe(502);
        expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('отсутствующий и чужой блокнот — одинаковый NOT_FOUND без данных блокнота', async () => {
        // Go ищет блокнот по ID и владельцу (backend#1): на оба отвечает 404
        useGo({ 'GET /notebooks/:id': () => goError(404, 'not_found') });
        const session = await cookie(goTokens().issue());
        const get = (id: number) =>
            rpc(`notebooks.get?input=${encodeURIComponent(JSON.stringify({ id }))}`, {
                cookie: session,
            });
        const [missing, foreign] = await Promise.all([get(404), get(7)]);
        expect(missing.status).toBe(404);
        expect(foreign.status).toBe(404);
        const [missingError, foreignError] = await Promise.all([
            errorOf(missing),
            errorOf(foreign),
        ]);
        expect(missingError.code).toBe('NOT_FOUND');
        expect(foreignError).toEqual(missingError);
    });

    test('успешный статус с телом не по контракту — BAD_GATEWAY', async () => {
        useGo({
            'GET /users/me': () => Response.json({}),
            'GET /notebooks': () => Response.json({}),
        });
        const c = await cookie(goTokens().issue());
        expect((await rpc('users.me', { cookie: c })).status).toBe(502);
        expect((await rpc('notebooks.list', { cookie: c })).status).toBe(502);
    });

    test('logout без сессии — успех без Go; при сбое Go — всё равно успех и удаление cookie', async () => {
        useGo({ 'POST /auth/logout': () => goError(500, 'internal') });
        const guest = await rpc('auth.logout', { body: {} });
        expect(guest.status).toBe(200);
        expect(go?.calls).toHaveLength(0);
        const res = await rpc('auth.logout', {
            body: {},
            cookie: await cookie(goTokens().issue()),
        });
        expect(res.status).toBe(200);
        expect(cleared(res)).toBe(true);
    });

    test('Go не ответил за 5 с — BAD_GATEWAY', async () => {
        useGo({ 'GET /notebooks': hang });
        const started = performance.now();
        const res = await rpc('notebooks.list', { cookie: await cookie(goTokens().issue()) });
        expect(res.status).toBe(502);
        expect(performance.now() - started).toBeGreaterThan(4500);
    }, 10_000);
});

const head = (path: string, sessionCookie?: string) =>
    bff(
        new Request(`${ORIGIN}${path}`, {
            method: 'HEAD',
            headers: {
                Accept: 'text/html',
                ...(sessionCookie ? { Cookie: `${SESSION_COOKIE}=${sessionCookie}` } : {}),
            },
        }),
    );

const expectRedirect = async (res: Response, location: string, what: string) => {
    expect(res.status, what).toBe(302);
    expect(res.headers.get('Location'), what).toBe(location);
    expect(res.headers.get('Cache-Control'), what).toBe('private, no-store');
    expect(await res.text(), what).toBe('');
};

describe('HTML', () => {
    const NOTEBOOK = {
        id: 1,
        name: 'Первый блокнот',
        cells: [{ id: 'c1', kind: 'code', source: 'print(1)' }],
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-02T10:00:00Z',
    };
    const CONTENT = {
        hash: 'h1',
        cells: [
            {
                id: 'c1',
                kind: 'code',
                source: 'print(2)',
                outputs: [{ output_type: 'stream', name: 'stdout', text: '2' }],
                execution_count: 3,
                output_truncated: false,
            },
            { id: 'c2', kind: 'markdown', source: '# Заголовок' },
        ],
    };
    // данные блокнота — метаданные из GET /notebooks/{id}, hash и ячейки — из content
    const PAGE = {
        notebook: {
            id: 1,
            name: 'Первый блокнот',
            created_at: '2026-10-01T10:00:00Z',
            updated_at: '2026-10-02T10:00:00Z',
            ...CONTENT,
        },
    };

    test('гость — { user: null }, Go не вызывается, private no-store', async () => {
        useGo({});
        const res = await page(undefined, '/login');
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await bootstrap(res)).toEqual({ user: null });
        expect(go?.calls).toHaveLength(0);
    });

    test('гость: вход и регистрация — 200, /404 — приложение со статусом 404', async () => {
        useGo({});
        for (const path of ['/login', '/Register/']) {
            expect((await page(undefined, path)).status, path).toBe(200);
        }
        const res = await page(undefined, '/404');
        expect(res.status).toBe(404);
        expect(res.headers.get('Content-Type')).toBe('text/html; charset=UTF-8');
        expect(await bootstrap(res)).toEqual({ user: null });
    });

    test('гость: защищённые страницы и неизвестный адрес — 302 на /login, Go не вызывается', async () => {
        useGo({});
        for (const path of ['/', '/notebooks/1', '/Notebooks/42/', '/nope', '/notebooks/1/cells']) {
            await expectRedirect(await page(undefined, path), '/login', path);
        }
        await expectRedirect(await head('/notebooks/1'), '/login', 'HEAD');
        expect(go?.calls).toHaveLength(0);
    });

    test('сессию не восстановить — гость: 302 на /login и удаление cookie, блокнот не запрашивается', async () => {
        useGo({ 'POST /auth/refresh': () => goError(401, 'unauthorized') });
        const res = await page(await cookie(goTokens().issue(), now() - 1), '/notebooks/1');
        expect(cleared(res)).toBe(true);
        await expectRedirect(res, '/login', '/notebooks/1');
        expect(go?.calls.some((c) => c.path.startsWith('/notebooks'))).toBe(false);
    });

    test('вошедший: свои страницы — 200, /404 — 404, неизвестный адрес — 302 на /404', async () => {
        useGo({ 'GET /users/me': () => Response.json(USER) });
        const session = await cookie(goTokens().issue());
        for (const path of ['/', '/login', '/register']) {
            expect((await page(session, path)).status, path).toBe(200);
        }
        const notFound = await page(session, '/404');
        expect(notFound.status).toBe(404);
        expect(await bootstrap(notFound)).toEqual({ user: USER });
        for (const path of ['/nope', '/notebooks', '/notebooks/1/cells', '/login/extra']) {
            await expectRedirect(await page(session, path), '/404', path);
        }
        await expectRedirect(await head('/nope', session), '/404', 'HEAD');
    });

    test('вошедший, свой блокнот — 200 и блокнот с hash в bootstrap без лишних полей Go', async () => {
        useGo({
            'GET /users/me': () => Response.json(USER),
            'GET /notebooks/:id': () => Response.json({ ...NOTEBOOK, owner_id: 1 }),
            'GET /notebooks/:id/content': () => Response.json(CONTENT),
        });
        const session = await cookie(goTokens().issue());
        // %31 — тот же блокнот 1: сегмент декодируется, как в роутере клиента
        for (const path of ['/notebooks/1', '/notebooks/%31']) {
            const res = await page(session, path);
            expect(res.status, path).toBe(200);
            expect(await bootstrap(res)).toEqual({ user: USER, notebookPage: PAGE });
        }
        expect(go?.calls.filter((c) => c.path === '/notebooks/1')).toHaveLength(2);
        expect(go?.calls.filter((c) => c.path === '/notebooks/1/content')).toHaveLength(2);
    });

    test('notebooks.get — метаданные и content одним объектом, ячейки из content', async () => {
        useGo({
            'GET /notebooks/:id': () => Response.json({ ...NOTEBOOK, owner_id: 1 }),
            'GET /notebooks/:id/content': () => Response.json(CONTENT),
        });
        const res = await rpc(`notebooks.get?input=${encodeURIComponent('{"id":1}')}`, {
            cookie: await cookie(goTokens().issue()),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { result: { data: unknown } }).result.data).toEqual(PAGE);
    });

    test('content 404 — NOT_FOUND и 302 на /404; content 500 — BAD_GATEWAY и 503', async () => {
        const session = await cookie(goTokens().issue());
        const get = () =>
            rpc(`notebooks.get?input=${encodeURIComponent('{"id":1}')}`, { cookie: session });
        for (const [status, rpcStatus] of [
            [404, 404],
            [500, 502],
        ] as const) {
            useGo({
                'GET /users/me': () => Response.json(USER),
                'GET /notebooks/:id': () => Response.json(NOTEBOOK),
                'GET /notebooks/:id/content': () => goError(status, 'x'),
            });
            expect((await get()).status, String(status)).toBe(rpcStatus);
            const html = await page(session, '/notebooks/1');
            if (status === 404) await expectRedirect(html, '/404', 'content 404');
            else expect(html.status).toBe(503);
            go?.restore();
        }
    });

    test('вошедший, отсутствующий и чужой блокнот — одинаковый 302 на /404 без данных', async () => {
        // Go ищет блокнот по ID и владельцу (backend#1): на оба отвечает 404
        useGo({
            'GET /users/me': () => Response.json(USER),
            'GET /notebooks/:id': () => goError(404, 'not_found'),
        });
        const session = await cookie(goTokens().issue());
        const missing = await page(session, '/notebooks/404');
        const foreign = await page(session, '/notebooks/7');
        expect([...missing.headers.entries()]).toEqual([...foreign.headers.entries()]);
        await expectRedirect(missing, '/404', 'отсутствующий');
        await expectRedirect(foreign, '/404', 'чужой');
    });

    test('вошедший, некорректный ID — 302 на /404, Go за блокнотом не ходит', async () => {
        useGo({ 'GET /users/me': () => Response.json(USER) });
        const session = await cookie(goTokens().issue());
        for (const path of ['/notebooks/abc', '/notebooks/0', '/notebooks/1.5']) {
            await expectRedirect(await page(session, path), '/404', path);
        }
        expect(go?.calls.some((c) => c.path.startsWith('/notebooks'))).toBe(false);
    });

    test('сбой Go на блокноте — 503, не 404', async () => {
        useGo({
            'GET /users/me': () => Response.json(USER),
            'GET /notebooks/:id': () => goError(500, 'internal'),
        });
        const res = await page(await cookie(goTokens().issue()), '/notebooks/1');
        expect(res.status).toBe(503);
        expect(await res.text()).not.toContain('<script');
    });

    test('сессия закончилась на запросе блокнота — 302 на /login и удаление cookie', async () => {
        useGo({
            'GET /users/me': () => Response.json(USER),
            'GET /notebooks/:id': () => goError(401, 'unauthorized'),
            'GET /notebooks/:id/content': () => goError(401, 'unauthorized'),
            'POST /auth/refresh': () => goError(401, 'unauthorized'),
        });
        const res = await page(await cookie(goTokens().issue()), '/notebooks/1');
        expect(cleared(res)).toBe(true);
        await expectRedirect(res, '/login', '/notebooks/1');
    });

    test('пользователь — только DTO из users/me', async () => {
        useGo({ 'GET /users/me': () => Response.json({ ...USER, password_hash: 'x' }) });
        expect(await bootstrap(await page(await cookie(goTokens().issue()), '/'))).toEqual({
            user: USER,
        });
    });

    test('истёкший refresh в cookie — гость, cookie удаляется, Go не вызывается', async () => {
        useGo({});
        const res = await page(await cookie(goTokens().issue(), now() - 100, now() - 1), '/login');
        expect(await bootstrap(res)).toEqual({ user: null });
        expect(cleared(res)).toBe(true);
        expect(go?.calls).toHaveLength(0);
    });

    test('отказ refresh — гость и удаление cookie', async () => {
        useGo({ 'POST /auth/refresh': () => goError(401, 'unauthorized') });
        const res = await page(await cookie(goTokens().issue(), now() - 1), '/login');
        expect(res.status).toBe(200);
        expect(await bootstrap(res)).toEqual({ user: null });
        expect(cleared(res)).toBe(true);
    });

    test('сбой Go — 503 без приложения, сессия не удаляется', async () => {
        useGo({ 'GET /users/me': () => goError(500, 'internal') });
        const res = await page(await cookie(goTokens().issue()));
        expect(res.status).toBe(503);
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await res.text()).not.toContain('<script');
        expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('удачный refresh и сбой users/me — 503 с новой cookie сессии', async () => {
        const tokens = goTokens();
        useGo({ ...tokens.routes, 'GET /users/me': () => goError(500, 'internal') });
        const res = await page(await cookie(tokens.issue(), now() - 1));
        expect(res.status).toBe(503);
        expect(newSession(res)).toBeDefined();
    });

    test('строки пользователя не создают элементов и восстанавливаются байт в байт', async () => {
        const user = {
            id: 7,
            login: '</script><script>alert(1)</script><!-- "\'&Привет ',
            avatar_url: null,
        };
        const html = await renderBootstrap(template, { user }, new Headers()).text();
        let scripts = 0;
        await new HTMLRewriter()
            .on('script', { element: () => void scripts++ })
            .transform(new Response(html))
            .text();
        expect(scripts).toBe(2);
        expect(await bootstrap(new Response(html))).toEqual({ user });
    });
});

describe('публичные файлы', () => {
    test('стили офлайн-страницы отдаются с типом text/css', async () => {
        const css = new Blob(['body {}'], { type: 'text/css' }) as Bun.BunFile;
        const app = createBff(template, new Map([['offline.css', css]]));
        const res = await app(new Request(`${ORIGIN}/offline.css`));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toStartWith('text/css');
    });

    test('офлайн-страница отдаётся до HTML-обработчика: без сессии и Go', async () => {
        const offline = new Blob(['<h1>offline</h1>'], { type: 'text/html' }) as Bun.BunFile;
        const app = createBff(template, new Map([['offline.html', offline]]));
        const headers = { Accept: 'text/html' };
        const res = await app(new Request(`${ORIGIN}/offline.html`, { headers }));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('<h1>offline</h1>');
    });
});

describe('robots.txt', () => {
    const ROBOTS = 'User-agent: *\nDisallow: /api/\n';

    test('GET — 200, text/plain и запрет обхода /api/ при любом Accept и cookie; Go не вызывается', async () => {
        useGo({});
        const session = await cookie(goTokens().issue());
        for (const headers of [
            {},
            { Accept: 'text/html' },
            { Accept: 'text/html', Cookie: `${SESSION_COOKIE}=${session}` },
        ] as Record<string, string>[]) {
            const res = await bff(new Request(`${ORIGIN}/robots.txt`, { headers }));
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('text/plain; charset=UTF-8');
            expect(res.headers.getSetCookie()).toEqual([]);
            expect(await res.text()).toBe(ROBOTS);
        }
        expect(go?.calls).toHaveLength(0);
    });

    test('HEAD через Bun.serve — те же статус и заголовки, без тела', async () => {
        // настоящий fetch к серверу: фейковый Go его подменил бы
        const server = Bun.serve({ port: 0, fetch: bff });
        try {
            const url = `${server.url}robots.txt`;
            const get = await fetch(url, { headers: { Accept: 'text/html' } });
            const res = await fetch(url, { method: 'HEAD', headers: { Accept: 'text/html' } });
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe(get.headers.get('Content-Type'));
            expect(res.headers.get('Content-Length')).toBe(String(ROBOTS.length));
            expect(await res.text()).toBe('');
            expect(await get.text()).toBe(ROBOTS);
        } finally {
            await server.stop(true);
        }
    });
});

describe('смена логина и пароля', () => {
    test('updateLogin шлёт PATCH /users/me и возвращает пользователя', async () => {
        const tokens = goTokens();
        const renamed = { id: 1, login: 'orbit', avatar_url: null };
        useGo({ 'PATCH /users/me': () => Response.json(renamed) });
        const res = await rpc('users.updateLogin', {
            body: { login: 'orbit' },
            cookie: await cookie(tokens.issue()),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { result: { data: unknown } }).result.data).toEqual(renamed);
        expect(go?.calls[0]?.body).toEqual({ login: 'orbit' });
        expect(go?.calls[0]?.headers.get('Authorization')).toStartWith('Bearer ');
    });

    test('занятый логин — CONFLICT с appCode login_taken', async () => {
        useGo({ 'PATCH /users/me': () => goError(409, 'login_taken') });
        const res = await rpc('users.updateLogin', {
            body: { login: 'orbit' },
            cookie: await cookie(goTokens().issue()),
        });
        expect(await errorOf(res)).toMatchObject({ code: 'CONFLICT', appCode: 'login_taken' });
    });

    test('неверный логин не доходит до Go', async () => {
        useGo({});
        const res = await rpc('users.updateLogin', {
            body: { login: 'a' },
            cookie: await cookie(goTokens().issue()),
        });
        expect(res.status).toBe(400);
        expect(go?.calls).toHaveLength(0);
    });

    test('changePassword шлёт PUT /users/me/password и завершает сессию', async () => {
        useGo({ 'PUT /users/me/password': () => new Response(null, { status: 204 }) });
        const body = { current_password: 'old-password', new_password: 'new-password' };
        const res = await rpc('users.changePassword', {
            body,
            cookie: await cookie(goTokens().issue()),
        });
        expect(res.status).toBe(200);
        expect(go?.calls[0]?.body).toEqual(body);
        expect(cleared(res)).toBe(true);
    });

    test('неверный текущий пароль не завершает сессию', async () => {
        useGo({ 'PUT /users/me/password': () => goError(400, 'invalid_current_password') });
        const res = await rpc('users.changePassword', {
            body: { current_password: 'wrong-password', new_password: 'new-password' },
            cookie: await cookie(goTokens().issue()),
        });
        expect(await errorOf(res)).toMatchObject({
            code: 'BAD_REQUEST',
            appCode: 'invalid_current_password',
        });
        expect(cleared(res)).toBe(false);
    });
});

const mutate = async (proc: string, body: unknown) =>
    rpc(proc, { body, cookie: await cookie(goTokens().issue()) });
const dataOf = async (res: Response) =>
    ((await res.json()) as { result: { data: unknown } }).result.data;

describe('ячейки по cell_id с hash', () => {
    const CELL = { id: 'c1', kind: 'code', source: 'print(1)' };

    const cases = [
        {
            proc: 'cells.create',
            input: { notebookId: 1, hash: 'h1', kind: 'code', source: '' },
            route: 'POST /notebooks/:id/content/cells',
            path: '/notebooks/1/content/cells',
            goBody: { kind: 'code', source: '' },
            reply: () => Response.json({ hash: 'h2', cell: CELL }, { status: 201 }),
            data: { hash: 'h2', cell: CELL },
        },
        {
            proc: 'cells.update',
            input: { notebookId: 1, hash: 'h1', cellId: 'c1', source: 'x = 1' },
            route: 'PATCH /notebooks/:id/content/cells/:cell',
            path: '/notebooks/1/content/cells/c1',
            goBody: { source: 'x = 1' },
            reply: () => Response.json({ hash: 'h2', cell: CELL }),
            data: { hash: 'h2', cell: CELL },
        },
        {
            proc: 'cells.move',
            input: { notebookId: 1, hash: 'h1', cellId: 'c1', index: 0 },
            route: 'POST /notebooks/:id/content/cells/:cell/move',
            path: '/notebooks/1/content/cells/c1/move',
            goBody: { index: 0 },
            reply: () => Response.json({ hash: 'h2' }),
            data: { hash: 'h2' },
        },
        {
            proc: 'cells.delete',
            input: { notebookId: 1, hash: 'h1', cellId: 'c1' },
            route: 'DELETE /notebooks/:id/content/cells/:cell',
            path: '/notebooks/1/content/cells/c1',
            goBody: undefined,
            reply: () => Response.json({ hash: 'h2' }),
            data: { hash: 'h2' },
        },
    ];

    for (const c of cases) {
        test(`${c.proc} — путь, тело и один сильный If-Match`, async () => {
            useGo({ [c.route]: c.reply });
            const res = await mutate(c.proc, c.input);
            expect(res.status).toBe(200);
            expect(await dataOf(res)).toEqual(c.data);
            expect(go?.calls).toHaveLength(1);
            const call = go!.calls[0]!;
            expect(`${call.method} ${call.path}`).toBe(`${c.route.split(' ')[0]} ${c.path}`);
            expect(call.body).toEqual(c.goBody);
            expect(call.headers.get('If-Match')).toBe('"h1"');
        });

        test(`${c.proc} — hash с кавычкой отклоняется без вызова Go`, async () => {
            useGo({ [c.route]: c.reply });
            const res = await mutate(c.proc, { ...c.input, hash: 'h"1' });
            expect((await errorOf(res)).code).toBe('BAD_REQUEST');
            expect(go?.calls).toHaveLength(0);
        });

        test(`${c.proc} — 409 notebook_conflict и 500`, async () => {
            useGo({ [c.route]: () => goError(409, 'notebook_conflict') });
            const conflict = await errorOf(await mutate(c.proc, c.input));
            expect(conflict).toMatchObject({ code: 'CONFLICT', appCode: 'notebook_conflict' });
            go?.restore();
            useGo({ [c.route]: () => goError(500, 'internal') });
            expect((await mutate(c.proc, c.input)).status).toBe(502);
        });
    }

    test('cells.create — 409 too_many_cells отличается от конфликта', async () => {
        useGo({ 'POST /notebooks/:id/content/cells': () => goError(409, 'too_many_cells') });
        const error = await errorOf(await mutate('cells.create', cases[0]!.input));
        expect(error).toMatchObject({ code: 'CONFLICT', appCode: 'too_many_cells' });
    });

    test('старые /cells и /cells/{index} не вызываются', async () => {
        useGo(Object.fromEntries(cases.map((c) => [c.route, c.reply])));
        for (const c of cases) await mutate(c.proc, c.input);
        expect(go?.calls.every((call) => call.path.includes('/content/cells'))).toBe(true);
    });
});
