/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { htmlDocument } from './htmlDocument';

test('базовые стили идут перед HTML результата и переопределяемы', () => {
    const html = '<style>.dataframe { color: red; }</style><table class="dataframe"></table>';
    const doc = htmlDocument(html);
    expect(doc.endsWith(html)).toBe(true);
    const base = doc.slice(0, -html.length);
    expect(base).toStartWith('<style>');
    expect(base).not.toContain('!important');
    // каждое правило — в :where(), специфичность нулевая
    for (const selector of base.match(/^[^\s{}][^{\n]*(?=\{)/gm) ?? []) {
        expect(selector.trim()).toMatch(/^:where\(.*\)$/);
    }
});
