/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { AVATAR_RULE, isAvatarFile, isAvatarSize } from './avatar';

test('стороны 64–4096 px включительно, каждая отдельно', () => {
    for (const [w, h] of [
        [64, 64],
        [64, 199],
        [199, 64],
        [199, 300],
        [300, 199],
        [64, 4096],
        [4096, 64],
    ] as const) {
        expect(isAvatarSize(w, h)).toBe(true);
    }
    for (const [w, h] of [
        [63, 200],
        [200, 63],
        [4097, 200],
        [200, 4097],
    ] as const) {
        expect(isAvatarSize(w, h)).toBe(false);
    }
});

test('подсказка называет диапазон 64–4096 px', () => {
    expect(AVATAR_RULE).toContain('от 64 до 4096 px');
});

test('файл: JPEG/PNG, не пустой, до 5 МиБ включительно', () => {
    const MAX = 5 * 1024 * 1024;
    expect(isAvatarFile({ type: 'image/png', size: MAX })).toBe(true);
    expect(isAvatarFile({ type: 'image/jpeg', size: 1 })).toBe(true);
    expect(isAvatarFile({ type: 'image/png', size: MAX + 1 })).toBe(false);
    expect(isAvatarFile({ type: 'image/png', size: 0 })).toBe(false);
    expect(isAvatarFile({ type: 'image/gif', size: 10 })).toBe(false);
});
