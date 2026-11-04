import type { Cell } from '@api/trpc';

/** Подтверждённое сервером содержимое блокнота: hash и ячейки по порядку. */
export type Snapshot = { hash: string; cells: Cell[] };

/** Ячейка из ответа создания: без сохранённых результатов. */
export type NewCell = { id: string; kind: Cell['kind']; source: string };

const encoder = new TextEncoder();

/**
 * Размер текста в байтах UTF-8 — так считается лимит source.
 * @param text текст
 * @returns число байт
 */
export function utf8Bytes(text: string): number {
    return encoder.encode(text).length;
}

const withSource = (cell: Cell, source: string): Cell =>
    cell.kind === 'code'
        ? { ...cell, source, outputs: [], execution_count: null, output_truncated: false }
        : { ...cell, source };

/**
 * Подтверждённое изменение source: у кода прежний результат больше не относится к ячейке.
 * @param snapshot снимок
 * @param hash hash из ответа
 * @param cellId ячейка
 * @param source отправленный текст
 * @returns новый снимок; ячейки, которой нет, не появляется
 */
export function applyUpdate(
    snapshot: Snapshot,
    hash: string,
    cellId: string,
    source: string,
): Snapshot {
    return {
        hash,
        cells: snapshot.cells.map((cell) => (cell.id === cellId ? withSource(cell, source) : cell)),
    };
}

/**
 * Подтверждённое создание ячейки в конце блокнота.
 * @param snapshot снимок
 * @param hash hash из ответа
 * @param cell ячейка из ответа
 * @returns новый снимок
 */
export function applyCreate(snapshot: Snapshot, hash: string, cell: NewCell): Snapshot {
    const created: Cell =
        cell.kind === 'code'
            ? { ...cell, kind: 'code', outputs: [], execution_count: null, output_truncated: false }
            : { ...cell, kind: 'markdown' };
    return { hash, cells: [...snapshot.cells, created] };
}

/**
 * Подтверждённое перемещение: результаты ячейки сохраняются.
 * @param snapshot снимок
 * @param hash hash из ответа
 * @param cellId ячейка
 * @param index итоговая позиция с нуля
 * @returns новый снимок
 */
export function applyMove(
    snapshot: Snapshot,
    hash: string,
    cellId: string,
    index: number,
): Snapshot {
    const cell = snapshot.cells.find((c) => c.id === cellId);
    if (!cell) return { ...snapshot, hash };
    const rest = snapshot.cells.filter((c) => c.id !== cellId);
    return { hash, cells: [...rest.slice(0, index), cell, ...rest.slice(index)] };
}

/**
 * Подтверждённое удаление.
 * @param snapshot снимок
 * @param hash hash из ответа
 * @param cellId ячейка
 * @returns новый снимок
 */
export function applyDelete(snapshot: Snapshot, hash: string, cellId: string): Snapshot {
    return { hash, cells: snapshot.cells.filter((c) => c.id !== cellId) };
}

/**
 * Совпадают ли снимки по тому, что защищает hash: id, вид, порядок и source. Результаты исполнения
 * не сравниваются.
 * @param a первый снимок
 * @param b второй снимок
 * @returns true, если структура и исходники совпадают
 */
export function sameStructure(a: Snapshot, b: Snapshot): boolean {
    return (
        a.cells.length === b.cells.length &&
        a.cells.every((cell, i) => {
            const other = b.cells[i];
            return (
                other !== undefined &&
                other.id === cell.id &&
                other.kind === cell.kind &&
                other.source === cell.source
            );
        })
    );
}
