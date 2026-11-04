// Смена сессии на настоящем клиенте tRPC: fetch управляется тестом, BFF не нужен.
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { SESSION_CHANGED, onSessionLost, switchSession, trpc } from '@api/trpc';
import { changePassword, logout, logoutAll, uploadAvatar, useSessionStore } from '@stores/session';

type Answer = { status: number; body: unknown };

// Ответы fetch по процедуре; отложенный — пока тест не вызовет release
const answers = new Map<string, () => Promise<Answer>>();
const sessionLost = mock(() => useSessionStore.setState({ status: 'guest', user: null }));
const realFetch = globalThis.fetch;

const unauthorized: Answer = {
    status: 401,
    body: [{ error: { message: 'no session', code: -32001, data: { code: 'UNAUTHORIZED' } } }],
};
const ok = (data: unknown): Answer => ({ status: 200, body: [{ result: { data } }] });
const networkError = () => Promise.reject(new TypeError('Failed to fetch'));

/**
 * Ответ, который тест отпускает сам.
 * @param answer ответ после release
 * @returns ответ для answers и функция, отпускающая его
 */
function held(answer: Answer) {
    const { promise, resolve } = Promise.withResolvers<Answer>();
    return { answer: () => promise, release: () => resolve(answer) };
}

beforeEach(() => {
    answers.clear();
    sessionLost.mockClear();
    onSessionLost(sessionLost);
    useSessionStore.setState({
        status: 'authed',
        user: { id: 1, login: 'denis', avatar_url: null },
    });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const path = new URL(String(input), 'https://localhost').pathname.replace('/api/trpc/', '');
        const respond = answers.get(path);
        if (!respond) throw new Error(`нет ответа для ${path}`);
        const { status, body } = await respond();
        return Response.json(body, { status });
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

test('UNAUTHORIZED вне смены сессии — потеря сессии', async () => {
    answers.set('notebooks.list', async () => unauthorized);
    await expect(trpc.notebooks.list.query()).rejects.toThrow();
    expect(sessionLost).toHaveBeenCalledTimes(1);
});

test('UNAUTHORIZED во время выхода и сбой auth.logout — сессия потеряна, пользователь гость', async () => {
    const list = held(unauthorized);
    answers.set('notebooks.list', list.answer);
    answers.set('auth.logout', networkError);
    const listed = trpc.notebooks.list.query().catch(() => undefined);
    await Bun.sleep(0);

    const done = logout();
    await Bun.sleep(0);
    expect(sessionLost).not.toHaveBeenCalled();
    list.release();
    await listed;

    expect(await done).toBe(true);
    expect(sessionLost).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().status).toBe('guest');
});

test('UNAUTHORIZED во время выхода и удачный auth.logout — обычный выход без потери сессии', async () => {
    const list = held(unauthorized);
    answers.set('notebooks.list', list.answer);
    answers.set('auth.logout', async () => ok(null));
    const listed = trpc.notebooks.list.query().catch(() => undefined);
    await Bun.sleep(0);

    const done = logout();
    list.release();
    await listed;

    expect(await done).toBe(true);
    expect(sessionLost).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('guest');
});

test('сбой auth.logout без UNAUTHORIZED — выхода нет, сессия прежняя', async () => {
    answers.set('auth.logout', networkError);
    expect(await logout()).toBe(false);
    expect(sessionLost).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('authed');
});

test('факт потери не переживает смену сессии: следующий сбой выхода её не завершает', async () => {
    const list = held(unauthorized);
    answers.set('notebooks.list', list.answer);
    answers.set('auth.logout', async () => ok(null));
    const listed = trpc.notebooks.list.query().catch(() => undefined);
    await Bun.sleep(0);
    const first = switchSession(() => trpc.auth.logout.mutate());
    list.release();
    await listed;
    await first;

    useSessionStore.setState({
        status: 'authed',
        user: { id: 1, login: 'denis', avatar_url: null },
    });
    answers.set('auth.logout', networkError);
    expect(await logout()).toBe(false);
    expect(sessionLost).not.toHaveBeenCalled();
});

test('перекрывающиеся смены сессии идут по очереди: потеря сессии не теряется, запросы не пропускаются', async () => {
    const list = held(unauthorized);
    const firstLogout = held({ status: 500, body: [] });
    answers.set('notebooks.list', list.answer);
    answers.set('auth.logout', firstLogout.answer);
    const listed = trpc.notebooks.list.query().catch(() => undefined);
    await Bun.sleep(0);

    const first = switchSession(() => trpc.auth.logout.mutate()).catch(() => 'first failed');
    list.release();
    await listed;
    await Bun.sleep(0);

    // второй вызов, пока первый auth.logout ещё в пути
    let secondStarted = false;
    const second = switchSession(() => {
        secondStarted = true;
        return Promise.reject(new Error('второй выход не удался'));
    }).catch(() => 'second failed');
    await Bun.sleep(0);
    expect(secondStarted).toBe(false);
    // первая смена ещё идёт: новый защищённый запрос не стартует
    await expect(trpc.users.me.query()).rejects.toThrow(SESSION_CHANGED);

    firstLogout.release();
    expect(await first).toBe('first failed');
    expect(await second).toBe('second failed');
    expect(secondStarted).toBe(true);
    expect(sessionLost).toHaveBeenCalledTimes(1);
});

const PASSWORDS = { current_password: 'old-password', new_password: 'new-password' };
const rejected = (status: number, code: string, appCode: string): Answer => ({
    status,
    body: [{ error: { message: appCode, code: -32000, data: { code, appCode } } }],
});

test('смена пароля ждёт отправленный запрос: его 401 не отменяет подтверждение', async () => {
    const update = held(unauthorized);
    let passwordSent = false;
    answers.set('users.updateLogin', update.answer);
    answers.set('users.changePassword', async () => {
        passwordSent = true;
        return ok({ ok: true });
    });
    const updating = trpc.users.updateLogin.mutate({ login: 'denis2' }).catch(() => undefined);
    await Bun.sleep(0);

    const done = changePassword(PASSWORDS);
    await Bun.sleep(0);
    expect(passwordSent).toBe(false);

    update.release();
    await updating;
    await done;

    expect(passwordSent).toBe(true);
    expect(sessionLost).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('guest');
});

test('пока меняется пароль, новые защищённые запросы не стартуют', async () => {
    const password = held(ok({ ok: true }));
    answers.set('users.changePassword', password.answer);
    const done = changePassword(PASSWORDS);
    await Bun.sleep(0);

    await expect(trpc.users.updateLogin.mutate({ login: 'denis2' })).rejects.toThrow(
        SESSION_CHANGED,
    );

    password.release();
    await done;
});

test('неверный текущий пароль: сессия прежняя, запросы снова идут', async () => {
    answers.set('users.changePassword', async () =>
        rejected(400, 'BAD_REQUEST', 'invalid_current_password'),
    );
    answers.set('notebooks.list', async () => ok([]));

    await expect(changePassword(PASSWORDS)).rejects.toThrow();

    expect(sessionLost).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('authed');
    expect(await trpc.notebooks.list.query()).toEqual([]);
});

test('401 самой смены пароля — потеря сессии', async () => {
    answers.set('users.changePassword', async () => unauthorized);
    await expect(changePassword(PASSWORDS)).rejects.toThrow();
    expect(sessionLost).toHaveBeenCalledTimes(1);
});

test('выход со всех устройств ждёт отправленный запрос и только после 204 делает гостем', async () => {
    const list = held(ok([]));
    let sent = false;
    answers.set('notebooks.list', list.answer);
    answers.set('auth.logoutAll', async () => {
        sent = true;
        return ok({ ok: true });
    });
    const listing = trpc.notebooks.list.query();
    await Bun.sleep(0);

    const done = logoutAll();
    await Bun.sleep(0);
    expect(sent).toBe(false);
    await expect(trpc.notebooks.list.query()).rejects.toThrow(SESSION_CHANGED);

    list.release();
    await listing;
    expect(await done).toBe('ok');
    expect(sent).toBe(true);
    expect(useSessionStore.getState().status).toBe('guest');
});

test('сбой выхода со всех устройств — не успех, сессия прежняя', async () => {
    answers.set('auth.logoutAll', async () => rejected(502, 'BAD_GATEWAY', 'internal'));
    expect(await logoutAll()).toBe('failed');
    answers.set('auth.logoutAll', networkError);
    expect(await logoutAll()).toBe('failed');
    expect(sessionLost).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('authed');
});

test('401 выхода со всех устройств — потеря сессии, а не подтверждённый общий выход', async () => {
    answers.set('auth.logoutAll', async () => unauthorized);
    expect(await logoutAll()).toBe('lost');
    expect(sessionLost).toHaveBeenCalledTimes(1);
});

const single = (answer: Answer): Answer => ({
    status: answer.status,
    body: (answer.body as unknown[])[0],
});

test('аватар уходит multipart без батча; после 200 пользователь в сторе с новым URL', async () => {
    const user = { id: 1, login: 'denis', avatar_url: 'https://cdn.example/a.png' };
    let body: unknown;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = init?.body;
        return Response.json(single(ok(user)).body);
    }) as typeof fetch;
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });

    expect(await uploadAvatar(file)).toBeNull();
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('avatar')).toBeInstanceOf(File);
    expect(useSessionStore.getState().user).toEqual(user);
});

test('ошибки аватара: файл отвергнут или сбой загрузки; прежний аватар остаётся', async () => {
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    for (const [status, code, appCode, kind] of [
        [400, 'BAD_REQUEST', 'validation_error', 'file'],
        [413, 'PAYLOAD_TOO_LARGE', 'payload_too_large', 'file'],
        [415, 'UNSUPPORTED_MEDIA_TYPE', 'unsupported_media_type', 'file'],
        [502, 'BAD_GATEWAY', 's2s_forbidden', 'upload'],
        [502, 'BAD_GATEWAY', 'internal', 'upload'],
    ] as const) {
        answers.set('users.uploadAvatar', async () => single(rejected(status, code, appCode)));
        expect(await uploadAvatar(file)).toBe(kind);
    }
    answers.set('users.uploadAvatar', networkError);
    expect(await uploadAvatar(file)).toBe('upload');
    expect(useSessionStore.getState().user?.avatar_url).toBeNull();
    expect(sessionLost).not.toHaveBeenCalled();
});
