/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { pastedPart, SOURCE_LIMIT_BYTES } from './snapshot';

const full = 'a'.repeat(SOURCE_LIMIT_BYTES);

test('ASCII помещается целиком', () => {
    expect(pastedPart('', 0, 0, 'abc')).toBe('abc');
});

test('ASCII обрезается до лимита', () => {
    expect(pastedPart('', 0, 0, 'a'.repeat(70_000)).length).toBe(65_536);
});

test('кириллица — по 2 байта', () => {
    expect(pastedPart('', 0, 0, 'я'.repeat(40_000))).toBe('я'.repeat(32_768));
});

test('большой буфер обрезается до 32 768 «я»', () => {
    expect(pastedPart('', 0, 0, 'я'.repeat(64 * 1024 * 1024))).toBe('я'.repeat(32_768));
});

test('emoji не разрезается', () => {
    expect(pastedPart('a'.repeat(65_534), 65_534, 65_534, '😀')).toBe('');
    expect(pastedPart('a'.repeat(65_532), 65_532, 65_532, '😀😀')).toBe('😀');
});

test('выделение освобождает место', () => {
    expect(pastedPart(full, 0, 10, 'я'.repeat(10))).toBe('я'.repeat(5));
    expect(pastedPart(full, 0, full.length, 'b'.repeat(70_000)).length).toBe(65_536);
});

test('заполненная ячейка без выделения', () => {
    expect(pastedPart(full, full.length, full.length, 'x')).toBe('');
});
