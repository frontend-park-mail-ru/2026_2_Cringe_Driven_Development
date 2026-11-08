// Когда у ячейки открыт редактор: raw показывается буквальным текстом и не редактируется.
import { expect, test } from 'bun:test';
import { isEditing } from '@components/Cell/editing';

const state = (edit: boolean, tooLarge = false, readOnly = false) => ({ readOnly, edit, tooLarge });

test('код редактируется всегда, кроме тача', () => {
    expect(isEditing('code', state(false))).toBe(true);
    expect(isEditing('code', state(false, false, true))).toBe(false);
});

test('Markdown — только в режиме правки или при исходнике больше лимита', () => {
    expect(isEditing('markdown', state(false))).toBe(false);
    expect(isEditing('markdown', state(true))).toBe(true);
    expect(isEditing('markdown', state(false, true))).toBe(true);
});

test('raw не открывает редактор ни в каком режиме', () => {
    expect(isEditing('raw', state(true))).toBe(false);
    expect(isEditing('raw', state(true, true))).toBe(false);
});
