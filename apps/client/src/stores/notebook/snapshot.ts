import type { Cell } from '@api/trpc';

/** Подтверждённое сервером содержимое блокнота: hash и ячейки по порядку. */
export type Snapshot = { hash: string; cells: Cell[] };

/** Вид ячейки, которую можно создать: raw только читается. */
export type CreatableKind = Exclude<Cell['kind'], 'raw'>;

/** Операция над ячейками, которую подтверждает сервер. */
export type Op =
    | { type: 'update'; cellId: string; source: string }
    | { type: 'create'; kind: CreatableKind; index?: number }
    | { type: 'move'; cellId: string; index: number }
    | { type: 'delete'; cellId: string };

const encoder = new TextEncoder();

/**
 * Больше ли текст лимита в байтах UTF-8. Кодируется только неоднозначная длина: символ UTF-16 —
 * от 1 до 3 байт.
 */
export function exceedsBytes(text: string, limit: number): boolean {
    if (text.length > limit) return true;
    if (text.length * 3 <= limit) return false;
    return encoder.encode(text).length > limit;
}

/** Самое длинное начало текста, которое помещается в лимит байт UTF-8; символы не разрезаются. */
export function fitBytes(text: string, limit: number): string {
    if (limit <= 0) return '';
    if (!exceedsBytes(text, limit)) return text;
    return text.slice(0, encoder.encodeInto(text, new Uint8Array(limit)).read);
}

/** Поля кода без результата исполнения: до первого запуска и после изменения source. */
const noOutput = () => ({ outputs: [], execution_count: null, output_truncated: false });

const withSource = (cell: Cell, source: string): Cell =>
    cell.kind === 'code' ? { ...cell, source, ...noOutput() } : { ...cell, source };

/**
 * Подтверждённое изменение source с `hash` из ответа: у кода прежний результат больше не относится
 * к ячейке. Ячейки, которой нет в снимке, не появляется.
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

/** Подтверждённое создание пустой ячейки с `id` и `hash` из ответа; без `index` — в конец. */
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

/** Подтверждённое перемещение на позицию `index` с нуля: результаты ячейки сохраняются. */
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

/** Подтверждённое удаление ячейки. */
export function applyDelete(snapshot: Snapshot, hash: string, cellId: string): Snapshot {
    return { hash, cells: snapshot.cells.filter((c) => c.id !== cellId) };
}

/**
 * Снимок после операции с её `hash` — тот же, что даст сервер, если она применилась. `createdId` —
 * id созданной ячейки, только для create.
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
