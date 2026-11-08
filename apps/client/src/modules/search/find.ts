/** Ячейка для поиска: id и текущий текст (черновик или source). */
export interface SearchCell {
    id: string;
    text: string;
}

/** Вхождение запроса: позиции UTF-16 в тексте ячейки, `to` не включается. */
export interface SearchRange {
    cellId: string;
    from: number;
    to: number;
}

// Строчная копия для поиска без учёта регистра и для каждой её позиции — позиция в исходнике,
// чтобы подсветить найденное в исходном тексте. Переводим по одному символу: строчная буква
// бывает длиннее заглавной ('İstanbul' → 'i̇stanbul'), и позиции копии и исходника расходятся.
// У сигмы две строчные: 'σ' и 'ς' в конце слова. Посимвольно 'Σ' всегда даёт 'σ', поэтому
// 'ς' тоже приводим к 'σ' — и в тексте, и в запросе
function lowered(text: string): { lower: string; starts: number[] } {
    let lower = '';
    const starts: number[] = [];
    let at = 0;
    for (const char of text) {
        const folded = char === 'ς' ? 'σ' : char.toLowerCase();
        for (let index = 0; index < folded.length; index++) starts.push(at);
        lower += folded;
        at += char.length;
    }
    starts.push(at);
    return { lower, starts };
}

// Граница внутри символа, который в нижнем регистре стал длиннее: в исходнике её нет
const splits = (starts: number[], index: number): boolean =>
    index > 0 && index < starts.length - 1 && starts[index] === starts[index - 1];

/**
 * Неперекрывающиеся вхождения запроса без учёта регистра: по ячейкам в порядке блокнота, внутри
 * ячейки — по позиции. Запрос — буквальная подстрока: не обрезается и не разбирается.
 * @param cells ячейки в порядке блокнота
 * @param query запрос
 * @returns вхождения; для пустого запроса — пусто
 */
export function findMatches(cells: readonly SearchCell[], query: string): SearchRange[] {
    if (!query) return [];
    const needle = lowered(query).lower;
    const ranges: SearchRange[] = [];
    for (const cell of cells) {
        const { lower, starts } = lowered(cell.text);
        let position = lower.indexOf(needle);
        while (position !== -1) {
            const end = position + needle.length;
            const accepted = !splits(starts, position) && !splits(starts, end);
            if (accepted)
                ranges.push({ cellId: cell.id, from: starts[position]!, to: starts[end]! });
            // отвергнутый кандидат не вхождение: пересекающееся с ним ещё может быть настоящим
            position = lower.indexOf(needle, accepted ? end : position + 1);
        }
    }
    return ranges;
}

/**
 * Одно ли это вхождение.
 * @param a вхождение или null
 * @param b вхождение или null
 * @returns true, если совпадают ячейка и позиции
 */
export function sameRange(a: SearchRange | null, b: SearchRange | null): boolean {
    if (!a || !b) return a === b;
    return a.cellId === b.cellId && a.from === b.from && a.to === b.to;
}

/**
 * Активное вхождение после пересчёта: прежнее, если оно осталось, иначе первое.
 * @param matches новые вхождения
 * @param previous прежнее активное
 * @returns активное вхождение или null, если вхождений нет
 */
export function keepActive(
    matches: readonly SearchRange[],
    previous: SearchRange | null,
): SearchRange | null {
    return matches.find((range) => sameRange(range, previous)) ?? matches[0] ?? null;
}

/**
 * Соседнее вхождение по кругу: после последнего — первое, перед первым — последнее.
 * @param matches вхождения
 * @param active текущее активное
 * @param direction 1 — следующее, -1 — предыдущее
 * @returns новое активное или null, если вхождений нет
 */
export function stepActive(
    matches: readonly SearchRange[],
    active: SearchRange | null,
    direction: 1 | -1,
): SearchRange | null {
    if (matches.length === 0) return null;
    const index = matches.findIndex((range) => sameRange(range, active));
    if (index === -1) return direction === 1 ? matches[0]! : matches.at(-1)!;
    return matches[(index + direction + matches.length) % matches.length]!;
}
