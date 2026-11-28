// Проверки без env: errors.ts и http.ts читают конфигурацию при импорте, её задаёт mtls.test.ts
import { expect, test } from 'bun:test';

import {
    getOnlineConfKeyInput,
    listOnlineConfKeysInput,
    onlineConfKeyInput,
} from '@cdd/schemas/validate';

import { GoError, unwrap } from '../src/go/errors.ts';
import { onlineConfKeyResponse } from '../src/go/responses.ts';

const flag = {
    scope: 'workspace',
    name: 'notebook.comments',
    kind: 'flag',
    rollout_percent: 25,
    include_user_ids: [1, 7],
    exclude_user_ids: [42],
};

test('config keeps any JSON value, including false, 0 and null', () => {
    for (const value of [{ a: [1] }, [1, 'a'], 'text', 0, false, null]) {
        const key = { scope: 'frontend', name: 'editor.theme', kind: 'config', value };
        expect(onlineConfKeyInput(key) as unknown).toEqual({ success: true, data: key });
    }
    expect(
        onlineConfKeyInput({ scope: 'frontend', name: 'editor.theme', kind: 'config' }).success,
    ).toBe(false);
});

test('flag rejects out-of-range percent, repeated and intersecting user lists', () => {
    expect(onlineConfKeyInput(flag).success).toBe(true);
    for (const patch of [
        { rollout_percent: 101 },
        { rollout_percent: -1 },
        { rollout_percent: 2.5 },
        { include_user_ids: [1, 1] },
        { exclude_user_ids: [7] },
    ]) {
        expect(onlineConfKeyInput({ ...flag, ...patch }).success).toBe(false);
    }
    expect(onlineConfKeyInput({ ...flag, rollout_percent: 100 }).success).toBe(true);
});

test('key input is strict and names the failing field', () => {
    expect(onlineConfKeyInput({ ...flag, user_id: 1 }).success).toBe(false);
    expect(onlineConfKeyInput({ ...flag, kind: 'secret' })).toEqual({
        success: false,
        issues: [{ path: ['kind'], message: 'Одно из: config, flag' }],
    });
    expect(onlineConfKeyInput({ ...flag, scope: '../identity' }).success).toBe(false);
});

test('query inputs need a scope and reject repeated parameters', () => {
    expect(listOnlineConfKeysInput({ scope: 'frontend' }).success).toBe(true);
    expect(listOnlineConfKeysInput({ search: 'editor' }).success).toBe(false);
    expect(getOnlineConfKeyInput({ scope: 'frontend', name: ['a', 'b'] }).success).toBe(false);
});

test('OnlineConf refusals keep their status and code for the BFF error mapping', () => {
    expect(unwrap({ status: 204, data: undefined }, [204])).toBeUndefined();
    for (const [status, code] of [
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [403, 's2s_forbidden'],
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

test('a key from OnlineConf that breaks the contract is not passed on', () => {
    const key: unknown = unwrap(
        { status: 200, data: { ...flag, extra: 1 } },
        [200],
        onlineConfKeyResponse,
    );
    expect(key).toEqual(flag);
    expect(() =>
        unwrap(
            { status: 200, data: { ...flag, rollout_percent: 500 } },
            [200],
            onlineConfKeyResponse,
        ),
    ).toThrow(GoError);
});
