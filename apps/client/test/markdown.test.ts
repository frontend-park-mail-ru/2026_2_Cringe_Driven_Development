// Собственный разбор Markdown: поддерживаемые конструкции по референсу markdown-it и безопасность.
import { expect, test } from 'bun:test';
import { parseMarkdown, safeHref, type MdBlock, type MdInline } from '@modules/markdown/parse';

const text = (value: string): MdInline => ({ type: 'text', text: value });
const paragraph = (...children: MdInline[]): MdBlock => ({ type: 'paragraph', children });
const link = (href: string, label: string): MdInline => ({
    type: 'link',
    href,
    external: false,
    children: [text(label)],
});

test('заголовки и абзацы', () => {
    expect(parseMarkdown('# Лаба 3\nРеализуем спуск\nдальше\n\n## Функция')).toEqual([
        { type: 'heading', level: 1, children: [text('Лаба 3')] },
        // мягкий перенос, как у markdown-it
        paragraph(text('Реализуем спуск\nдальше')),
        { type: 'heading', level: 2, children: [text('Функция')] },
    ]);
    expect(parseMarkdown('#без пробела')).toEqual([paragraph(text('#без пробела'))]);
    expect(parseMarkdown('###### шесть')[0]).toMatchObject({ type: 'heading', level: 6 });
    expect(parseMarkdown('####### семь')[0]?.type).toBe('paragraph');
    // setext не поддерживаем
    expect(parseMarkdown('Заголовок\n---')[0]?.type).toBe('paragraph');
});

test('списки', () => {
    expect(parseMarkdown('- a\n- b\n  - c')).toEqual([
        {
            type: 'list',
            ordered: false,
            start: 1,
            items: [
                [paragraph(text('a'))],
                [
                    paragraph(text('b')),
                    { type: 'list', ordered: false, start: 1, items: [[paragraph(text('c'))]] },
                ],
            ],
        },
    ]);
    expect(parseMarkdown('3. a\n4. b')[0]).toMatchObject({ type: 'list', ordered: true, start: 3 });
    expect(parseMarkdown('2) a')[0]).toMatchObject({ type: 'list', ordered: true, start: 2 });
    expect(parseMarkdown('* a\n+ b')[0]).toMatchObject({ type: 'list', ordered: false });
});

test('табуляция после маркера считается по колонкам', () => {
    // содержимое начинается с колонки 4: два пробела — ещё не вложенность
    expect(parseMarkdown('-\titem\n  - next')).toEqual([
        {
            type: 'list',
            ordered: false,
            start: 1,
            items: [[paragraph(text('item'))], [paragraph(text('next'))]],
        },
    ]);
    expect(parseMarkdown('-\titem\n    - nested')).toEqual([
        {
            type: 'list',
            ordered: false,
            start: 1,
            items: [
                [
                    paragraph(text('item')),
                    {
                        type: 'list',
                        ordered: false,
                        start: 1,
                        items: [[paragraph(text('nested'))]],
                    },
                ],
            ],
        },
    ]);
});

test('цитаты и блоки кода', () => {
    expect(parseMarkdown('> цитата\n> дальше')).toEqual([
        { type: 'quote', children: [paragraph(text('цитата\nдальше'))] },
    ]);
    expect(parseMarkdown('```py\n<svg onload=x>\n```')).toEqual([
        { type: 'code', text: '<svg onload=x>', lang: 'py' },
    ]);
    expect(parseMarkdown('~~~ Python3 {.x}\nx\n~~~')[0]).toEqual({
        type: 'code',
        text: 'x',
        lang: 'Python3',
    });
    expect(parseMarkdown('~~~\nне закрыт')).toEqual([{ type: 'code', text: 'не закрыт' }]);
    expect(parseMarkdown('```\n  отступ\n\nпусто\n```')).toEqual([
        { type: 'code', text: '  отступ\n\nпусто' },
    ]);
});

test('обратные кавычки после ``` — inline-code, не блок кода', () => {
    expect(parseMarkdown('```code```')).toEqual([paragraph({ type: 'code', text: 'code' })]);
    expect(parseMarkdown('```code```\nplain')).toEqual([
        paragraph({ type: 'code', text: 'code' }, text('\nplain')),
    ]);
    // и абзац не прерывает
    expect(parseMarkdown('текст\n```x```')).toEqual([
        paragraph(text('текст\n'), { type: 'code', text: 'x' }),
    ]);
    // у ~~~ обратные кавычки в info string допустимы
    expect(parseMarkdown('~~~ a`b\nx\n~~~')[0]).toMatchObject({ type: 'code', text: 'x' });
});

test('без `>` или отступа продолжается только абзац', () => {
    const outside = paragraph(text('Outside'));
    expect(parseMarkdown('> текст\nдальше')).toEqual([
        { type: 'quote', children: [paragraph(text('текст\nдальше'))] },
    ]);
    expect(parseMarkdown('> # Heading\nOutside')).toEqual([
        { type: 'quote', children: [{ type: 'heading', level: 1, children: [text('Heading')] }] },
        outside,
    ]);
    expect(parseMarkdown('> ```\n> inside\n> ```\nOutside')).toEqual([
        { type: 'quote', children: [{ type: 'code', text: 'inside' }] },
        outside,
    ]);
    // во вложенной цитате — так же
    expect(parseMarkdown('> > # H\nOutside')[1]).toEqual(outside);
    expect(parseMarkdown('> > a\nb')).toEqual([
        { type: 'quote', children: [{ type: 'quote', children: [paragraph(text('a\nb'))] }] },
    ]);
    // и в пункте списка
    expect(parseMarkdown('- # H\nOutside')[1]).toEqual(outside);
    expect(parseMarkdown('- ```\n  x\n  ```\nOutside')[1]).toEqual(outside);
    expect(parseMarkdown('- a\nb')).toEqual([
        { type: 'list', ordered: false, start: 1, items: [[paragraph(text('a\nb'))]] },
    ]);
});

test('выделение, inline-code и экранирование', () => {
    expect(parseMarkdown('**ж** *к* __ж__ _к_ `<b>` \\*нет\\*')).toEqual([
        paragraph(
            { type: 'strong', children: [text('ж')] },
            text(' '),
            { type: 'em', children: [text('к')] },
            text(' '),
            { type: 'strong', children: [text('ж')] },
            text(' '),
            { type: 'em', children: [text('к')] },
            text(' '),
            { type: 'code', text: '<b>' },
            text(' *нет*'),
        ),
    ]);
    expect(parseMarkdown('snake_case_name')).toEqual([paragraph(text('snake_case_name'))]);
    expect(parseMarkdown('a*b*c')).toEqual([
        paragraph(text('a'), { type: 'em', children: [text('b')] }, text('c')),
    ]);
    expect(parseMarkdown('`` `x` ``')).toEqual([paragraph({ type: 'code', text: '`x`' })]);
    expect(parseMarkdown('`**не жирный**`')).toEqual([
        paragraph({ type: 'code', text: '**не жирный**' }),
    ]);
    expect(parseMarkdown('**без пары')).toEqual([paragraph(text('**без пары'))]);
});

test('ссылки', () => {
    expect(parseMarkdown('[док](https://a.ru/x)')).toEqual([
        paragraph({
            type: 'link',
            href: 'https://a.ru/x',
            external: true,
            children: [text('док')],
        }),
    ]);
    expect(parseMarkdown('[x](/a "title")')).toEqual([
        paragraph({ type: 'link', href: '/a', external: false, children: [text('x')] }),
    ]);
    expect(parseMarkdown('[**ж**](#раздел)')).toEqual([
        paragraph({
            type: 'link',
            href: '#раздел',
            external: false,
            children: [{ type: 'strong', children: [text('ж')] }],
        }),
    ]);
});

test('скобки внутри inline-code не участвуют в разборе ссылки', () => {
    expect(parseMarkdown('[`a]b`](https://example.com)')).toEqual([
        paragraph({
            type: 'link',
            href: 'https://example.com',
            external: true,
            children: [{ type: 'code', text: 'a]b' }],
        }),
    ]);
    expect(parseMarkdown('[not a `link](/foo`)')).toEqual([
        paragraph(text('[not a '), { type: 'code', text: 'link](/foo' }, text(')')),
    ]);
    // незакрытая серия обратных кавычек — текст, скобки за ней работают
    expect(parseMarkdown('[a`b](/x)')).toEqual([paragraph(link('/x', 'a`b'))]);
});

test('ссылка внутри ссылки: внешняя остаётся текстом', () => {
    expect(parseMarkdown('[outer [inner](/x)](/y)')).toEqual([
        paragraph(text('[outer '), link('/x', 'inner'), text('](/y)')),
    ]);
    expect(parseMarkdown('[a *[b](/x)*](/y)')).toEqual([
        paragraph(text('[a '), { type: 'em', children: [link('/x', 'b')] }, text('](/y)')),
    ]);
});

test('сырой HTML — текст', () => {
    for (const source of [
        '<img src=x onerror=alert(1)>',
        '<script>alert(1)</script>',
        '<b>жирный</b>',
        '<https://a.ru>',
    ])
        expect(parseMarkdown(source)).toEqual([paragraph(text(source))]);
});

test('опасные ссылки — неактивный текст с исходной записью', () => {
    for (const source of [
        '[x](javascript:alert(1))',
        '[x](JaVaScRiPt:alert(1))',
        '[x]( \tjavascript:1)',
        '[x](data:text/html,1)',
        '[x](vbscript:1)',
        '[x](java\tscript:1)',
        '[x](java&#x09;script:1)',
        '[x](//evil.com)',
    ]) {
        expect(JSON.stringify(parseMarkdown(source))).not.toContain('"link"');
        expect(parseMarkdown(source)).toEqual([paragraph(text(source))]);
    }
});

test('safeHref', () => {
    expect(safeHref('https://a.ru')).toBe('https://a.ru');
    expect(safeHref('HTTP://a.ru')).toBe('HTTP://a.ru');
    expect(safeHref('./x.md')).toBe('./x.md');
    expect(safeHref('/notebooks/1')).toBe('/notebooks/1');
    expect(safeHref('#раздел')).toBe('#раздел');
    expect(safeHref('x?a=b:c')).toBe('x?a=b:c');
    // протокол-относительная — внешний адрес без схемы
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('mailto:a@b.ru')).toBeNull();
    expect(safeHref(' javascript:1')).toBeNull();
    expect(safeHref('\njavascript:1')).toBeNull();
});

test('неподдерживаемое — текст', () => {
    expect(parseMarkdown('| a | b |\n|---|---|')[0]?.type).toBe('paragraph');
    expect(parseMarkdown('![img](x.png)')[0]?.type).toBe('paragraph');
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n  \n')).toEqual([]);
});

test('исходник не меняется', () => {
    const source = '# a\n\n- b';
    parseMarkdown(source);
    expect(source).toBe('# a\n\n- b');
});

test('64 КиБ патологического ввода — быстро и без переполнения стека', () => {
    for (const source of [
        '*'.repeat(65536),
        '['.repeat(65536),
        '`'.repeat(65536),
        '_a'.repeat(32768),
        '[a]('.repeat(13107),
        '>'.repeat(10000) + ' x',
        '- '.repeat(20000),
        '  '.repeat(10000) + '- x',
    ]) {
        const started = performance.now();
        parseMarkdown(source);
        expect(performance.now() - started).toBeLessThan(200);
    }
});

// Глубина дерева = глубина рекурсии рендера: без предела просмотр падает с переполнением стека
const depthOf = (nodes: (MdBlock | MdInline)[]): number => {
    let max = 0;
    for (const node of nodes) {
        const inner: (MdBlock | MdInline)[] =
            'children' in node ? node.children : 'items' in node ? node.items.flat() : [];
        max = Math.max(max, 1 + depthOf(inner));
    }
    return max;
};

test('вложенное выделение ограничено по глубине', () => {
    for (const source of [
        '*'.repeat(8000) + 'a' + '*'.repeat(8000),
        '*'.repeat(32000) + 'a' + '*'.repeat(32000),
        '_'.repeat(8000) + 'a' + '_'.repeat(8000),
        '[*'.repeat(5000) + 'a' + '*](/x)'.repeat(5000),
    ])
        expect(depthOf(parseMarkdown(source))).toBeLessThanOrEqual(80);
    // обычная вложенность не страдает
    expect(parseMarkdown('***a***')).toEqual([
        paragraph({ type: 'em', children: [{ type: 'strong', children: [text('a')] }] }),
    ]);
});

test('title ссылки без пары — линейно', () => {
    for (const source of ['[](a ('.repeat(10923), '[a](b ('.repeat(9362), '[](a "'.repeat(10923)]) {
        const started = performance.now();
        parseMarkdown(source);
        expect(performance.now() - started).toBeLessThan(200);
    }
    expect(parseMarkdown('[x](/a "t\\"t")')[0]).toMatchObject({
        children: [{ type: 'link', href: '/a' }],
    });
});
