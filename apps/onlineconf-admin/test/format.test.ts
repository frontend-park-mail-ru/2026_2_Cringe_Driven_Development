/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { valuePreview } from '../src/keys/format';

const config = (value: unknown) =>
    ({
        type: 'config',
        name: 'bff.x',
        scope: 'bff',
        updated_at: '2026-11-28T00:00:00Z',
        value,
    }) as const;

test('config values stay visible and keep their JSON type', () => {
    expect([false, 0, null, '', [1], { a: 1 }].map((value) => valuePreview(config(value)))).toEqual(
        ['false', '0', 'null', '""', '[1]', '{"a":1}'],
    );
});

test('flag shows switch state and percent', () => {
    const flag = {
        type: 'flag',
        name: 'bff.f',
        scope: 'bff',
        updated_at: '2026-11-28T00:00:00Z',
    } as const;
    expect(valuePreview({ ...flag, enabled: true, rollout_percent: 25 })).toBe('Вкл · 25%');
    expect(valuePreview({ ...flag, enabled: false, rollout_percent: 50 })).toBe('Выкл · 50%');
});
