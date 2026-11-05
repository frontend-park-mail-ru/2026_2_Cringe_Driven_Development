import type { Cell } from '@api/trpc';

/** Подтверждённое сервером содержимое блокнота: hash и ячейки по порядку. */
export type Snapshot = { hash: string; cells: Cell[] };

/** Операция над ячейками, которую подтверждает сервер. */
export type Op =
    | { type: 'update'; cellId: string; source: string }
    | { type: 'create'; kind: Cell['kind']; index?: number }
    | { type: 'move'; cellId: string; index: number }
    | { type: 'delete'; cellId: string };

const encoder = new TextEncoder();

/**
 * Больше ли текст лимита в байтах UTF-8. Кодируется только неоднозначная длина: символ UTF-16 —
 * от 1 до 3 байт.
 * @param text текст
 * @param limit лимит в байтах
 * @returns true, если байт больше лимита
 */
export function exceedsBytes(text: string, limit: number): boolean {
    if (text.length > limit) return true;
    if (text.length * 3 <= limit) return false;
    return encoder.encode(text).length > limit;
}

// У кода без результата исполнения: до первого запуска и после изменения source
const noOutput = () => ({ outputs: [], execution_count: null, output_truncated: false });

const withSource = (cell: Cell, source: string): Cell =>
    cell.kind === 'code' ? { ...cell, source, ...noOutput() } : { ...cell, source };

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
 * Подтверждённое создание пустой ячейки.
 * @param snapshot снимок
 * @param hash hash из ответа
 * @param id id из ответа
 * @param kind вид ячейки
 * @param index позиция с нуля; без неё — в конец
 * @returns новый снимок
 */
export function applyCreate(
    snapshot: Snapshot,
    hash: string,
    id: string,
    kind: Cell['kind'],
    index = snapshot.cells.length,
): Snapshot {
    const created: Cell =
        kind === 'code' ? { id, kind, source: '', ...noOutput() } : { id, kind, source: '' };
    return { hash, cells: snapshot.cells.toSpliced(index, 0, created) };
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
 * Подтверждённая операция: тот же снимок, что даст сервер, если она применилась.
 * @param snapshot снимок до операции
 * @param hash hash после операции
 * @param op операция
 * @param createdId id созданной ячейки — для create
 * @returns снимок после операции
 */
export function applyOp(snapshot: Snapshot, hash: string, op: Op, createdId = ''): Snapshot {
    switch (op.type) {
        case 'update':
            return applyUpdate(snapshot, hash, op.cellId, op.source);
        case 'create':
            return applyCreate(snapshot, hash, createdId, op.kind, op.index);
        case 'move':
            return applyMove(snapshot, hash, op.cellId, op.index);
        case 'delete':
            return applyDelete(snapshot, hash, op.cellId);
    }
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
