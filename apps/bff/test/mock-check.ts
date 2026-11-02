// Проверка Cloud Mock Apidog по контракту: статусы mock expectations и тела по zod-схемам.
// Адрес — GO_API_URL, как у BFF: GO_API_URL=<адрес Cloud Mock> bun run mock:check
import * as z from '@cdd/schemas';

type Case = {
    name: string;
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    status: number;
    schema?: { safeParse(data: unknown): { success: boolean } };
};

const base = process.env.GO_API_URL;
if (!base) {
    console.error(
        'не задан GO_API_URL: адрес Cloud Mock (без /api/v1: пути ручек мок отдаёт от корня)',
    );
    process.exit(1);
}

const bearer = { Authorization: 'Bearer mock-access-login' };
const user = { login: 'denis', password: 'password123' };

const cases: Case[] = [
    {
        name: 'register',
        method: 'POST',
        path: '/auth/register',
        body: user,
        status: 201,
        schema: z.RegisterUserResponse,
    },
    {
        name: 'register: логин занят',
        method: 'POST',
        path: '/auth/register',
        body: { ...user, login: 'taken' },
        status: 409,
    },
    {
        name: 'register: короткий пароль',
        method: 'POST',
        path: '/auth/register',
        body: { ...user, password: 'short' },
        status: 400,
    },
    {
        name: 'login',
        method: 'POST',
        path: '/auth/login',
        body: user,
        status: 200,
        schema: z.LoginUserResponse,
    },
    {
        name: 'login: неверный пароль',
        method: 'POST',
        path: '/auth/login',
        body: { ...user, password: 'wrong-password' },
        status: 401,
    },
    {
        name: 'refresh',
        method: 'POST',
        path: '/auth/refresh',
        body: { refresh_token: 'mock-refresh-login' },
        status: 200,
        schema: z.RefreshTokenResponse,
    },
    {
        name: 'refresh: отозванный',
        method: 'POST',
        path: '/auth/refresh',
        body: { refresh_token: 'revoked' },
        status: 401,
    },
    {
        name: 'logout',
        method: 'POST',
        path: '/auth/logout',
        headers: bearer,
        body: { refresh_token: 'mock-refresh-login' },
        status: 204,
    },
    {
        name: 'users/me',
        method: 'GET',
        path: '/users/me',
        headers: bearer,
        status: 200,
        schema: z.GetCurrentUserResponse,
    },
    { name: 'users/me: без Bearer', method: 'GET', path: '/users/me', status: 401 },
    {
        name: 'users/me: истёкший access',
        method: 'GET',
        path: '/users/me',
        headers: { Authorization: 'Bearer expired' },
        status: 401,
    },
    {
        name: 'users/me: чужой X-BFF-Key',
        method: 'GET',
        path: '/users/me',
        headers: { ...bearer, 'X-BFF-Key': 'wrong' },
        status: 403,
    },
    {
        name: 'смена логина',
        method: 'PATCH',
        path: '/users/me',
        headers: bearer,
        body: { login: 'new_login' },
        status: 200,
        schema: z.UpdateCurrentUserResponse,
    },
    {
        name: 'смена логина: занят',
        method: 'PATCH',
        path: '/users/me',
        headers: bearer,
        body: { login: 'taken' },
        status: 409,
    },
    {
        name: 'смена пароля',
        method: 'PUT',
        path: '/users/me/password',
        headers: bearer,
        body: { current_password: 'password123', new_password: 'password456' },
        status: 204,
    },
    {
        name: 'смена пароля: неверный текущий',
        method: 'PUT',
        path: '/users/me/password',
        headers: bearer,
        body: { current_password: 'wrong-password', new_password: 'password456' },
        status: 400,
    },
    {
        name: 'смена пароля: совпадает с текущим',
        method: 'PUT',
        path: '/users/me/password',
        headers: bearer,
        body: { current_password: 'password123', new_password: 'same-password' },
        status: 400,
    },
    {
        name: 'notebooks',
        method: 'GET',
        path: '/notebooks',
        headers: bearer,
        status: 200,
        schema: z.ListNotebooksResponse,
    },
    { name: 'notebooks: без Bearer', method: 'GET', path: '/notebooks', status: 401 },
    {
        name: 'notebooks/1',
        method: 'GET',
        path: '/notebooks/1',
        headers: bearer,
        status: 200,
        schema: z.GetNotebookResponse,
    },
    { name: 'notebooks/404', method: 'GET', path: '/notebooks/404', headers: bearer, status: 404 },
    {
        name: 'создание блокнота',
        method: 'POST',
        path: '/notebooks',
        headers: bearer,
        body: { name: 'Новый блокнот' },
        status: 201,
        schema: z.CreateNotebookResponse,
    },
    {
        name: 'добавление блока',
        method: 'POST',
        path: '/notebooks/1/cells',
        headers: bearer,
        body: { kind: 'code' },
        status: 201,
        schema: z.CreateCellResponse,
    },
    {
        name: 'удаление блока',
        method: 'DELETE',
        path: '/notebooks/1/cells/0',
        headers: bearer,
        status: 204,
    },
    {
        name: 'удаление: нет блока',
        method: 'DELETE',
        path: '/notebooks/1/cells/99',
        headers: bearer,
        status: 404,
    },
];

let failed = 0;
for (const c of cases) {
    const headers = {
        ...(c.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...c.headers,
    };
    const body = c.body === undefined ? undefined : JSON.stringify(c.body);
    const res = await fetch(base + c.path, { method: c.method, headers, body });
    const text = await res.text();
    const problems: string[] = [];
    if (res.status !== c.status) problems.push(`статус ${res.status}, ожидался ${c.status}`);
    else if (c.schema && !c.schema.safeParse(JSON.parse(text)).success)
        problems.push('тело не по схеме');
    else if (c.status >= 400 && typeof JSON.parse(text).code !== 'string')
        problems.push('нет code в ошибке');
    if (problems.length) failed++;
    console.log(
        `${problems.length ? 'FAIL' : 'ok  '} ${c.name}${problems.length ? ` — ${problems.join(', ')}` : ''}`,
    );
}

console.log(
    failed ? `\nне прошло: ${failed} из ${cases.length}` : `\nвсе ${cases.length} проверок прошли`,
);
process.exit(failed ? 1 : 0);
