// Проверки без env: errors.ts и http.ts читают конфигурацию при импорте, её задаёт mtls.test.ts
import { expect, test } from 'bun:test';

import {
    createOnlineConfKeyInput,
    listOnlineConfKeysInput,
    onlineConfMeInput,
    resolveOnlineConfUserInput,
    updateOnlineConfKeyInput,
} from '@cdd/schemas/validate';

import { GoError, unwrap } from '../src/go/errors.ts';
import {
    onlineConfCardResponse,
    onlineConfHomeResponse,
    onlineConfNotebookResponse,
} from '../src/go/responses.ts';

const flag = {
    name: 'workspace.notebook_comments',
    type: 'flag',
    description: '',
    enabled: true,
    rollout_percent: 25,
    include_user_ids: [1, 7],
    exclude_user_ids: [42],
};

const user = { id: 42, login: 'reader' };
const card = {
    name: 'frontend.maintenance_banner',
    scope: 'frontend',
    type: 'config',
    description: '',
    created_at: '2026-11-28T12:00:00Z',
    updated_at: '2026-11-28T12:00:00Z',
    created_by: user,
    updated_by: user,
    format: 'json',
    value: false,
};

test('config update keeps any JSON value, including false, 0 and null', () => {
    for (const value of [{ a: [1] }, [1, 'a'], 'text', 0, false, null]) {
        const key = { name: 'frontend.theme', type: 'config', description: '', value };
        expect(updateOnlineConfKeyInput(key) as unknown).toEqual({ success: true, data: key });
    }
    expect(
        updateOnlineConfKeyInput({ name: 'frontend.theme', type: 'config', description: '' })
            .success,
    ).toBe(false);
});

test('flag update rejects out-of-range percent and intersecting user lists', () => {
    expect(updateOnlineConfKeyInput(flag).success).toBe(true);
    for (const patch of [
        { rollout_percent: 101 },
        { rollout_percent: -1 },
        { rollout_percent: 2.5 },
        { exclude_user_ids: [7] },
        { enabled: 'yes' },
    ]) {
        expect(updateOnlineConfKeyInput({ ...flag, ...patch }).success).toBe(false);
    }
    expect(updateOnlineConfKeyInput({ ...flag, rollout_percent: 100 }).success).toBe(true);
});

test('update input is strict and names the failing field', () => {
    expect(updateOnlineConfKeyInput({ ...flag, user_id: 1 }).success).toBe(false);
    expect(updateOnlineConfKeyInput({ ...flag, type: 'secret' })).toEqual({
        success: false,
        issues: [{ path: ['type'], message: 'Одно из: config, flag' }],
    });
    expect(updateOnlineConfKeyInput({ ...flag, name: '../identity' }).success).toBe(false);
});

test('create needs a name under its scope and json format only for configs', () => {
    const config = { name: 'frontend.banner', scope: 'frontend', type: 'config', format: 'json' };
    expect(createOnlineConfKeyInput(config).success).toBe(true);
    expect(createOnlineConfKeyInput({ ...config, name: 'bff.banner' }).success).toBe(false);
    expect(createOnlineConfKeyInput({ ...config, scope: 'runtime' }).success).toBe(false);
    expect(createOnlineConfKeyInput({ ...config, format: undefined }).success).toBe(false);
    const created = { name: 'bff.retry', scope: 'bff', type: 'flag', description: 'x' };
    expect(createOnlineConfKeyInput(created).success).toBe(true);
    expect(createOnlineConfKeyInput({ ...created, format: 'json' }).success).toBe(false);
});

test('query inputs: optional filters, exactly one user lookup, no repeats', () => {
    expect(listOnlineConfKeysInput({}).success).toBe(true);
    expect(listOnlineConfKeysInput({ scope: 'bff', type: 'flag', search: 'x' }).success).toBe(true);
    expect(listOnlineConfKeysInput({ scope: 'other' }).success).toBe(false);
    expect(listOnlineConfKeysInput({ search: ['a', 'b'] }).success).toBe(false);
    expect(resolveOnlineConfUserInput({ id: '42' }) as unknown).toEqual({
        success: true,
        data: { id: 42 },
    });
    expect(resolveOnlineConfUserInput({ login: 'reader' }).success).toBe(true);
    expect(resolveOnlineConfUserInput({ id: '42', login: 'reader' }).success).toBe(false);
    expect(resolveOnlineConfUserInput({}).success).toBe(false);
});

test('OnlineConf refusals keep their status and code for the BFF error mapping', () => {
    expect(unwrap({ status: 204, data: undefined }, [204])).toBeUndefined();
    for (const [status, code] of [
        [400, 'validation_error'],
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [403, 's2s_forbidden'],
        [404, 'not_found'],
        [409, 'key_name_taken'],
        [503, 'dependency_unavailable'],
    ] as const) {
        let error: unknown;
        try {
            unwrap({ status, data: { code, message: 'x' } }, [204]);
        } catch (err) {
            error = err;
        }
        expect(error).toBeInstanceOf(GoError);
        expect(error).toMatchObject({ kind: 'http', status, code });
    }
});

test('a card from OnlineConf that breaks the contract is not passed on', () => {
    const key: unknown = unwrap(
        { status: 200, data: { ...card, extra: 1 } },
        [200],
        onlineConfCardResponse,
    );
    expect(key).toEqual(card);
    expect(() =>
        unwrap({ status: 200, data: { ...card, format: 'yaml' } }, [200], onlineConfCardResponse),
    ).toThrow(GoError);
});

test('product screen values: screen is required, flag decision is never filled in', () => {
    expect(onlineConfMeInput({ screen: 'notebook' }).success).toBe(true);
    expect(onlineConfMeInput({}).success).toBe(false);
    expect(onlineConfMeInput({ screen: 'admin' }).success).toBe(false);

    const ok = { status: 200, data: { notebook_max_cells: 500, notebook_run_all: false } };
    expect(unwrap(ok, [200], onlineConfNotebookResponse) as unknown).toEqual(ok.data);
    // на главной решение флага не отдаётся, лишние поля Go отбрасываются
    expect(unwrap(ok, [200], onlineConfHomeResponse) as unknown).toEqual({
        notebook_max_cells: 500,
    });
    for (const data of [
        { notebook_max_cells: 500 },
        { notebook_max_cells: 500, notebook_run_all: 'true' },
        { notebook_max_cells: 0, notebook_run_all: true },
        { notebook_max_cells: 1001, notebook_run_all: true },
    ]) {
        expect(() => unwrap({ status: 200, data }, [200], onlineConfNotebookResponse)).toThrow(
            GoError,
        );
    }
    // устаревший снимок — сбой, а не прежнее значение
    expect(() =>
        unwrap(
            { status: 503, data: { code: 'onlineconf_unavailable', message: 'x' } },
            [200],
            onlineConfNotebookResponse,
        ),
    ).toThrow(GoError);
});
