// Свой разбор Markdown для просмотра ячеек. Поведение поддерживаемых конструкций — как у markdown-it
// (html: false, linkify: false); всё остальное остаётся текстом. HTML не создаётся: результат — дерево.

/** Строчный узел: текст, выделение, inline-code или проверенная ссылка. */
export type MdInline =
    | { type: 'text'; text: string }
    | { type: 'strong' | 'em'; children: MdInline[] }
    | { type: 'code'; text: string }
    | { type: 'link'; href: string; external: boolean; children: MdInline[] };

/** Блочный узел: заголовок, абзац, список, цитата или блок кода. */
export type MdBlock =
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: MdInline[] }
    | { type: 'paragraph'; children: MdInline[] }
    | { type: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
    | { type: 'quote'; children: MdBlock[] }
    /** lang — первое слово строки после ``` (` ```python ` → `python`), если оно есть */
    | { type: 'code'; text: string; lang?: string };

// Предел вложенности, чтобы рекурсия разбора и рендера не росла без границ. Глубже — текстом
const MAX_DEPTH = 32;
// Вложенность скобок в адресе ссылки, как у markdown-it
const MAX_PAREN_DEPTH = 32;

const ASCII_PUNCT = /^[!-/:-@[-`{-~]$/;
const PUNCT = /^[\p{P}\p{S}]$/u;
const SPACE = /^\s$/u;

/**
 * Разбирает исходник Markdown-ячейки в дерево узлов. Исходник не меняется; неподдерживаемое
 * остаётся текстом.
 * @param source исходник ячейки
 * @returns блоки верхнего уровня
 */
export function parseMarkdown(source: string): MdBlock[] {
    return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'), 0);
}

/**
 * Адрес ссылки, если он безопасен: `http(s):`, относительный или `#якорь`. Табуляции и переводы
 * строк браузер из адреса выбрасывает, поэтому и здесь они не мешают распознать схему.
 * @param raw адрес из исходника
 * @returns адрес для `href` или `null`, если ссылка должна остаться текстом
 */
export function safeHref(raw: string): string | null {
    // управляющие символы по краям браузер отбрасывает — здесь тоже
    // oxlint-disable-next-line no-control-regex
    const href = raw.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
    if (!href) return null;
    // `//host` и `/\host` браузер ведёт на чужой хост
    if (href.replace(/\\/g, '/').startsWith('//')) return null;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href);
    if (scheme && !/^https?$/i.test(scheme[1]!)) return null;
    return href;
}

// ——— Блоки ———

const isBlank = (line: string): boolean => /^[ \t]*$/.test(line);

// Ширина ведущего отступа: табуляция — до следующей позиции, кратной 4
function indentOf(line: string): number {
    let width = 0;
    for (const char of line) {
        if (char === ' ') width += 1;
        else if (char === '\t') width += 4 - (width % 4);
        else break;
    }
    return width;
}

function dropIndent(line: string, width: number): string {
    let taken = 0;
    let index = 0;
    while (taken < width && index < line.length) {
        const char = line[index];
        if (char === ' ') taken += 1;
        else if (char === '\t') taken += 4 - (taken % 4);
        else break;
        index += 1;
    }
    // табуляция могла перекрыть нужную ширину: лишнее — пробелами
    return ' '.repeat(Math.max(0, taken - width)) + line.slice(index);
}

interface ListMarker {
    ordered: boolean;
    /** Символ маркера: `-`, `*`, `+` или разделитель номера `.` / `)` */
    marker: string;
    start: number;
    /** Колонка содержимого: строки продолжения сдвинуты не меньше неё */
    indent: number;
    content: string;
}

// Ширина промежутка после маркера в колонках: табуляция — до следующей позиции, кратной 4
function gapWidth(gap: string, from: number): number {
    let width = from;
    for (const char of gap) width += char === '\t' ? 4 - (width % 4) : 1;
    return width - from;
}

function listMarker(line: string): ListMarker | null {
    const match = /^( {0,3})([-*+]|(\d{1,9})([.)]))([ \t]+|$)(.*)$/.exec(line);
    if (!match) return null;
    const [, lead = '', bullet = '', number, delimiter, gap = '', content = ''] = match;
    const column = lead.length + bullet.length;
    return {
        ordered: number !== undefined,
        marker: delimiter ?? bullet,
        start: number === undefined ? 1 : Number(number),
        indent: column + Math.max(1, gapWidth(gap, column)),
        content,
    };
}

// После ``` обратных кавычек быть не может: «```code```» — inline-code (CommonMark)
function fenceOf(line: string): RegExpExecArray | null {
    const fence = /^( {0,3})(`{3,}|~{3,})/.exec(line);
    if (fence?.[2]?.startsWith('`') && line.includes('`', fence[0].length)) return null;
    return fence;
}
const isHeading = (line: string): boolean => /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line);
const isQuote = (line: string): boolean => /^ {0,3}>/.test(line);

// Прерывает абзац: как в CommonMark, нумерованный список — только с 1 и непустой
function interrupts(line: string): boolean {
    if (fenceOf(line) || isHeading(line) || isQuote(line)) return true;
    const item = listMarker(line);
    return item !== null && item.content.trim() !== '' && (!item.ordered || item.start === 1);
}

const closingFence = (marker: string): RegExp =>
    new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);

// Открыт ли абзац после строк цитаты или пункта: только его можно продолжить лениво (CommonMark)
function paragraphState(): { push: (line: string) => void; open: () => boolean } {
    let fence: RegExp | null = null;
    let open = false;
    return {
        push(line) {
            let rest = line;
            // во вложенной цитате или пункте важен блок внутри них; глубже MAX_DEPTH разбор не вкладывает
            for (let level = 0; level < MAX_DEPTH; level += 1) {
                if (isQuote(rest)) rest = rest.replace(/^ {0,3}> ?/, '');
                else {
                    const item = fence ? null : listMarker(rest);
                    if (!item) break;
                    rest = item.content;
                }
            }
            if (fence) {
                if (fence.test(rest)) fence = null;
                open = false;
                return;
            }
            const marker = fenceOf(rest)?.[2];
            if (marker) {
                fence = closingFence(marker);
                open = false;
            } else open = !isBlank(rest) && !isHeading(rest);
        },
        open: () => open,
    };
}

function parseBlocks(lines: string[], depth: number): MdBlock[] {
    const blocks: MdBlock[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!;
        if (isBlank(line)) {
            i += 1;
            continue;
        }

        const fence = fenceOf(line);
        if (fence) {
            const [whole, lead = '', marker = ''] = fence;
            const lang = /^[ \t]*([^\s`]+)/.exec(line.slice(whole.length))?.[1];
            const closing = closingFence(marker);
            const code: string[] = [];
            i += 1;
            while (i < lines.length && !closing.test(lines[i]!)) {
                code.push(dropIndent(lines[i]!, Math.min(lead.length, indentOf(lines[i]!))));
                i += 1;
            }
            i += 1;
            blocks.push(
                lang
                    ? { type: 'code', text: code.join('\n'), lang }
                    : { type: 'code', text: code.join('\n') },
            );
            continue;
        }

        const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
        if (heading) {
            const [, hashes = '', rest = ''] = heading;
            // закрывающие `#` и хвостовые пробелы — не часть заголовка
            const text = rest.replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
            blocks.push({
                type: 'heading',
                level: hashes.length as 1 | 2 | 3 | 4 | 5 | 6,
                children: parseInline(text, 0),
            });
            i += 1;
            continue;
        }

        if (depth < MAX_DEPTH && isQuote(line)) {
            const inner: string[] = [];
            const paragraph = paragraphState();
            while (i < lines.length) {
                const current = lines[i]!;
                if (isQuote(current)) inner.push(current.replace(/^ {0,3}> ?/, ''));
                // ленивое продолжение абзаца внутри цитаты
                else if (!isBlank(current) && !interrupts(current) && paragraph.open())
                    inner.push(current);
                else break;
                paragraph.push(inner.at(-1)!);
                i += 1;
            }
            blocks.push({ type: 'quote', children: parseBlocks(inner, depth + 1) });
            continue;
        }

        const first = listMarker(line);
        if (depth < MAX_DEPTH && first) {
            i = parseList(lines, i, first, depth, blocks);
            continue;
        }

        const paragraph = [line.trim()];
        i += 1;
        while (i < lines.length && !isBlank(lines[i]!) && !interrupts(lines[i]!)) {
            paragraph.push(lines[i]!.trim());
            i += 1;
        }
        blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n'), 0) });
    }
    return blocks;
}

// Индекс первой непустой строки начиная с from
function nextFilled(lines: string[], from: number): number {
    let index = from;
    while (index < lines.length && isBlank(lines[index]!)) index += 1;
    return index;
}

function parseList(
    lines: string[],
    from: number,
    first: ListMarker,
    depth: number,
    blocks: MdBlock[],
): number {
    const items: MdBlock[][] = [];
    const same = (item: ListMarker | null): item is ListMarker =>
        item !== null && item.ordered === first.ordered && item.marker === first.marker;
    let i = from;
    while (i < lines.length) {
        const item = listMarker(lines[i]!);
        if (!same(item)) break;
        const content = [item.content];
        const paragraph = paragraphState();
        paragraph.push(item.content);
        i += 1;
        while (i < lines.length) {
            const current = lines[i]!;
            if (isBlank(current)) {
                // пустые строки — часть пункта, только если за ними продолжение с отступом
                const filled = nextFilled(lines, i);
                if (filled >= lines.length || indentOf(lines[filled]!) < item.indent) break;
                while (i < filled) {
                    content.push('');
                    i += 1;
                }
                paragraph.push('');
                continue;
            }
            if (indentOf(current) >= item.indent) content.push(dropIndent(current, item.indent));
            // ленивое продолжение абзаца пункта
            else if (!interrupts(current) && !listMarker(current) && paragraph.open())
                content.push(current);
            else break;
            paragraph.push(content.at(-1)!);
            i += 1;
        }
        items.push(parseBlocks(content, depth + 1));
        // пустые строки между пунктами одного списка
        const filled = nextFilled(lines, i);
        if (filled < lines.length && same(listMarker(lines[filled]!))) i = filled;
    }
    blocks.push({ type: 'list', ordered: first.ordered, start: first.start, items });
    return i;
}

// ——— Строчные элементы ———

interface Delimiter {
    kind: 'delimiter';
    char: '*' | '_';
    /** Сколько символов ещё не ушло в выделение */
    count: number;
    /** Длина серии в исходнике: для правила «кратно трём» */
    length: number;
    canOpen: boolean;
    canClose: boolean;
    node: ListNode;
    prev: Delimiter | null;
    next: Delimiter | null;
}

interface ListNode {
    item: MdInline | Delimiter;
    prev: ListNode | null;
    next: ListNode | null;
}

const isSpace = (char: string | undefined): boolean => char === undefined || SPACE.test(char);
const isPunct = (char: string | undefined): boolean => char !== undefined && PUNCT.test(char);

// Позиции серий обратных кавычек по длине: поиск закрывающей серии без повторного прохода
function backtickRuns(text: string): Map<number, number[]> {
    const runs = new Map<number, number[]>();
    let i = 0;
    while (i < text.length) {
        if (text[i] !== '`') {
            i += 1;
            continue;
        }
        const start = i;
        while (text[i] === '`') i += 1;
        const length = i - start;
        const list = runs.get(length);
        if (list) list.push(start);
        else runs.set(length, [start]);
    }
    return runs;
}

// Ближайшая серия той же длины после from; позиция запросов только растёт, поэтому курсор — тоже
function closingRuns(runs: Map<number, number[]>): (length: number, from: number) => number {
    const cursors = new Map<number, number>();
    return (length, from) => {
        const list = runs.get(length) ?? [];
        let cursor = cursors.get(length) ?? 0;
        while (cursor < list.length && list[cursor]! < from) cursor += 1;
        cursors.set(length, cursor);
        return list[cursor] ?? -1;
    };
}

// Пара `]` для каждой `[` одним проходом; без пары — -1. Скобки внутри inline-code не считаются
function matchBrackets(text: string, runs: Map<number, number[]>): Int32Array {
    const match = new Int32Array(text.length).fill(-1);
    const stack: number[] = [];
    const closingRun = closingRuns(runs);
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '\\') i += 1;
        else if (char === '`') {
            let length = 0;
            while (text[i + length] === '`') length += 1;
            const close = closingRun(length, i + length);
            i = (close < 0 ? i + length : close + length) - 1;
        } else if (char === '[') stack.push(i);
        else if (char === ']') {
            const open = stack.pop();
            if (open !== undefined) match[open] = i;
        }
    }
    return match;
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    colon: ':',
    Tab: '\t',
    NewLine: '\n',
    nbsp: ' ',
};

// Как markdown-it: экранирование и сущности в адресе раскрываются до проверки схемы
function unescapeDestination(raw: string): string {
    return raw
        .replace(/\\([!-/:-@[-`{-~])/g, '$1')
        .replace(
            /&(?:#[xX]([0-9a-fA-F]{1,6})|#(\d{1,7})|([A-Za-z]+));/g,
            (entity, hex, dec, name) => {
                if (name !== undefined) return NAMED_ENTITIES[name] ?? entity;
                const code = hex !== undefined ? parseInt(hex, 16) : Number(dec);
                return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
            },
        );
}

const skipSpaces = (text: string, from: number): number => {
    let i = from;
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    if (text[i] === '\n') i += 1;
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    return i;
};

// Ближайший неэкранированный символ от позиции: таблица на символ строится один раз — иначе
// поиск конца title от каждой `[` до конца текста квадратичен
function closingIndex(text: string): (char: string, from: number) => number {
    const tables = new Map<string, Int32Array>();
    let escaped: Uint8Array | null = null;
    return (char, from) => {
        let table = tables.get(char);
        if (!table) {
            if (!escaped) {
                escaped = new Uint8Array(text.length);
                for (let i = 1; i < text.length; i += 1)
                    if (text[i - 1] === '\\' && !escaped[i - 1]) escaped[i] = 1;
            }
            table = new Int32Array(text.length + 1).fill(-1);
            for (let i = text.length - 1; i >= 0; i -= 1)
                table[i] = text[i] === char && !escaped[i] ? i : table[i + 1]!;
            tables.set(char, table);
        }
        return table[from] ?? -1;
    };
}

// `(адрес "title")` после `]`: адрес и позиция за `)` или null
function linkTail(
    text: string,
    close: number,
    closing: (char: string, from: number) => number,
): { destination: string; end: number } | null {
    if (close < 0 || text[close + 1] !== '(') return null;
    let i = skipSpaces(text, close + 2);
    let destination: string;
    if (text[i] === '<') {
        const start = i + 1;
        i = start;
        while (i < text.length && text[i] !== '>' && text[i] !== '<' && text[i] !== '\n') {
            i += text[i] === '\\' ? 2 : 1;
        }
        if (text[i] !== '>') return null;
        destination = text.slice(start, i);
        i += 1;
    } else {
        const start = i;
        let level = 0;
        while (i < text.length) {
            const char = text[i]!;
            if (char === '\\' && ASCII_PUNCT.test(text[i + 1] ?? '')) {
                i += 2;
                continue;
            }
            if (char <= ' ') break;
            if (char === '(') {
                level += 1;
                if (level > MAX_PAREN_DEPTH) return null;
            } else if (char === ')') {
                if (level === 0) break;
                level -= 1;
            }
            i += 1;
        }
        if (level !== 0) return null;
        destination = text.slice(start, i);
    }
    const afterDestination = i;
    i = skipSpaces(text, i);
    const quote = text[i];
    // title отделён от адреса пробелом; сам он в просмотре не нужен
    if (i > afterDestination && (quote === '"' || quote === "'" || quote === '(')) {
        i = closing(quote === '(' ? ')' : quote, i + 1);
        if (i < 0) return null;
        i = skipSpaces(text, i + 1);
    }
    if (text[i] !== ')') return null;
    return { destination: unescapeDestination(destination), end: i + 1 };
}

function parseInline(text: string, depth: number): MdInline[] {
    const runs = backtickRuns(text);
    const closingRun = closingRuns(runs);
    const brackets = matchBrackets(text, runs);
    const closings = closingIndex(text);
    // меняются внутри append: без приведения TypeScript считает их всегда null
    let head = null as ListNode | null;
    let tail = null as ListNode | null;
    let firstDelimiter: Delimiter | null = null;
    let lastDelimiter: Delimiter | null = null;
    let buffer = '';

    const append = (item: MdInline | Delimiter): ListNode => {
        const node: ListNode = { item, prev: tail, next: null };
        if (tail) tail.next = node;
        else head = node;
        tail = node;
        return node;
    };
    const flush = () => {
        if (buffer) append({ type: 'text', text: buffer });
        buffer = '';
    };
    let i = 0;
    while (i < text.length) {
        const char = text[i]!;

        if (char === '\\' && ASCII_PUNCT.test(text[i + 1] ?? '')) {
            buffer += text[i + 1];
            i += 2;
            continue;
        }

        if (char === '`') {
            let length = 0;
            while (text[i + length] === '`') length += 1;
            const close = closingRun(length, i + length);
            if (close < 0) {
                buffer += text.slice(i, i + length);
                i += length;
                continue;
            }
            let code = text.slice(i + length, close).replace(/\n/g, ' ');
            if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim())
                code = code.slice(1, -1);
            flush();
            append({ type: 'code', text: code });
            i = close + length;
            continue;
        }

        const image = char === '!' && text[i + 1] === '[';
        if (char === '[' || image) {
            const open = image ? i + 1 : i;
            const tailOfLink = depth < MAX_DEPTH ? linkTail(text, brackets[open]!, closings) : null;
            if (tailOfLink) {
                // картинок нет в MVP: остаются текстом, как и ссылки с опасным адресом
                const href = image ? null : safeHref(tailOfLink.destination);
                if (href === null) buffer += text.slice(i, tailOfLink.end);
                else {
                    flush();
                    const children = parseInline(text.slice(open + 1, brackets[open]), depth + 1);
                    if (containsLink(children)) {
                        // ссылка внутри ссылки недопустима: внутренняя остаётся ссылкой,
                        // внешняя — текстом, как у markdown-it
                        buffer += '[';
                        flush();
                        for (const child of children) append(child);
                        buffer += text.slice(brackets[open], tailOfLink.end);
                    } else {
                        const link: MdInline = {
                            type: 'link',
                            href,
                            external: /^https?:/i.test(href),
                            children,
                        };
                        depths.set(link, 1 + depthOfItems(children));
                        append(link);
                    }
                }
                i = tailOfLink.end;
                continue;
            }
            buffer += char;
            i += 1;
            continue;
        }

        if (char === '*' || char === '_') {
            let length = 0;
            while (text[i + length] === char) length += 1;
            const before = text[i - 1];
            const after = text[i + length];
            const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
            const right =
                !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
            flush();
            const delimiter: Delimiter = {
                kind: 'delimiter',
                char,
                count: length,
                length,
                canOpen: char === '*' ? left : left && (!right || isPunct(before)),
                canClose: char === '*' ? right : right && (!left || isPunct(after)),
                node: null as unknown as ListNode,
                prev: lastDelimiter,
                next: null,
            };
            delimiter.node = append(delimiter);
            if (lastDelimiter) lastDelimiter.next = delimiter;
            else firstDelimiter = delimiter;
            lastDelimiter = delimiter;
            i += length;
            continue;
        }

        buffer += char;
        i += 1;
    }
    flush();

    processEmphasis(firstDelimiter, depth);
    const items: (MdInline | Delimiter)[] = [];
    for (let node: ListNode | null = head; node; node = node.next) items.push(node.item);
    return finalize(items);
}

const containsLink = (nodes: MdInline[]): boolean =>
    nodes.some(
        (node) =>
            node.type === 'link' ||
            ((node.type === 'strong' || node.type === 'em') && containsLink(node.children)),
    );

// Глубина вложенности узлов выделения и ссылок: по ней дерево удерживается в пределах MAX_DEPTH
const depths = new WeakMap<object, number>();

const depthOfItems = (items: (MdInline | Delimiter)[]): number => {
    let max = 0;
    for (const item of items) max = Math.max(max, depths.get(item) ?? 0);
    return max;
};

function unlink(delimiter: Delimiter): void {
    if (delimiter.prev) delimiter.prev.next = delimiter.next;
    if (delimiter.next) delimiter.next.prev = delimiter.prev;
}

function removeNode(node: ListNode): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
}

// Алгоритм выделения CommonMark: пары разделителей → strong/em, остальное — текст
function processEmphasis(first: Delimiter | null, depth: number): void {
    // ниже этой границы открывающего для такого закрывающего уже нет
    const bottoms = new Map<string, Delimiter | null>();

    let closer = first;
    while (closer) {
        if (!closer.canClose) {
            closer = closer.next;
            continue;
        }
        const key = `${closer.char}${closer.canOpen ? 1 : 0}${closer.length % 3}`;
        const bottom = bottoms.get(key) ?? null;
        let opener = closer.prev;
        while (opener && opener !== bottom) {
            const odd =
                (opener.canClose || closer.canOpen) &&
                (opener.length + closer.length) % 3 === 0 &&
                !(opener.length % 3 === 0 && closer.length % 3 === 0);
            if (opener.char === closer.char && opener.canOpen && !odd) break;
            opener = opener.prev;
        }
        const children: (MdInline | Delimiter)[] = [];
        if (opener && opener !== bottom)
            for (let node = opener.node.next; node && node !== closer.node; node = node.next)
                children.push(node.item);
        const nested = depth + depthOfItems(children) + 1;
        // слишком глубоко — пары нет: разделители остаются текстом
        if (!opener || opener === bottom || nested > MAX_DEPTH) {
            bottoms.set(key, closer.prev);
            const next: Delimiter | null = closer.next;
            if (!closer.canOpen) unlink(closer);
            closer = next;
            continue;
        }

        const used = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
        opener.count -= used;
        closer.count -= used;
        // разделители между парой остаются текстом
        opener.next = closer;
        closer.prev = opener;
        const item: MdInline = { type: used === 2 ? 'strong' : 'em', children: finalize(children) };
        depths.set(item, nested - depth);
        const wrapper: ListNode = { item, prev: opener.node, next: closer.node };
        opener.node.next = wrapper;
        closer.node.prev = wrapper;
        if (opener.count === 0) {
            removeNode(opener.node);
            unlink(opener);
        }
        if (closer.count === 0) {
            const next: Delimiter | null = closer.next;
            removeNode(closer.node);
            unlink(closer);
            closer = next;
        }
    }
}

// Оставшиеся разделители — текстом, соседние текстовые узлы — одним
function finalize(items: (MdInline | Delimiter)[]): MdInline[] {
    const result: MdInline[] = [];
    for (const item of items) {
        const node: MdInline =
            'kind' in item ? { type: 'text', text: item.char.repeat(item.count) } : item;
        if (node.type === 'text' && !node.text) continue;
        const last = result.at(-1);
        if (node.type === 'text' && last?.type === 'text') last.text += node.text;
        else result.push(node.type === 'text' ? { ...node } : node);
    }
    return result;
}
