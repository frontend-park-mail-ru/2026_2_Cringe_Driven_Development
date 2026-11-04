import { expect, test } from 'bun:test';
import { isAvatarFile, isAvatarSize } from '@utils/avatar';

const MiB5 = 5 * 1024 * 1024;

test('аватар: только непустой JPEG или PNG до 5 МиБ включительно', () => {
    expect(isAvatarFile({ type: 'image/png', size: MiB5 })).toBe(true);
    expect(isAvatarFile({ type: 'image/jpeg', size: 1 })).toBe(true);
    expect(isAvatarFile({ type: 'image/png', size: MiB5 + 1 })).toBe(false);
    expect(isAvatarFile({ type: 'image/png', size: 0 })).toBe(false);
    expect(isAvatarFile({ type: 'image/gif', size: 10 })).toBe(false);
});

test('аватар: каждая сторона от 200 до 4096 px включительно', () => {
    expect(isAvatarSize(200, 4096)).toBe(true);
    expect(isAvatarSize(199, 300)).toBe(false);
    expect(isAvatarSize(300, 4097)).toBe(false);
});
