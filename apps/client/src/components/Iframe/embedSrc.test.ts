/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { embedSrc } from './embedSrc';

const origin = 'https://cellestial.ru';

describe('embedSrc', () => {
    test('принимает локальные пути внутри /embed/', () => {
        expect(embedSrc('/embed/preview', origin)).toBe('/embed/preview');
        expect(embedSrc('/embed/preview?x=1#a', origin)).toBe('/embed/preview?x=1#a');
        expect(embedSrc('https://cellestial.ru/embed/preview', origin)).toBe('/embed/preview');
    });

    test.each([
        '/profile',
        '/embed',
        '/embedx/a',
        '/embed/../profile',
        '//evil.com/embed/a',
        'https://evil.com/embed/a',
        'javascript:alert(1)',
        'http://[',
    ])('отклоняет %s', (src) => {
        expect(embedSrc(src, origin)).toBeUndefined();
    });
});
