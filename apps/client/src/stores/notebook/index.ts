import { create } from '@cdd-team/zustand';
import { isRpcError, trpc, type Cell, type NotebookPageData } from '@api/trpc';
import {
    applyCreate,
    applyDelete,
    applyMove,
    applyUpdate,
    utf8Bytes,
    type Snapshot,
} from './snapshot';

/** Лимит исходника ячейки — 64 КиБ в UTF-8. */
export const SOURCE_LIMIT_BYTES = 65_536;
/** Пауза ввода перед автосохранением. */
export const AUTOSAVE_DELAY_MS = 500;
/** Сколько видна подпись «Сохранено». */
export const SAVED_VISIBLE_MS = 4000;

/** Статус сохранения для шапки. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

/** Ошибка, о которой нужно сообщить на странице. */
export type NotebookError = 'save' | 'load' | 'notebook_gone' | 'too_many_cells';

interface NotebookState {
    /** Открытый блокнот; null — страница блокнота не открыта */
    notebookId: number | null;
    meta: { name: string; created_at: string; updated_at: string } | null;
    /** Последнее подтверждённое сервером содержимое */
    confirmed: Snapshot | null;
    /** Текст ячеек, отличающийся от подтверждённого */
    drafts: Record<string, string>;
    /** Ячейки с исходником больше лимита: не сохраняются, пока их не сократят */
    tooLarge: Record<string, true>;
    status: SaveStatus;
    /** Идёт или ждёт структурная операция: добавление, перемещение, удаление */
    structureBusy: boolean;
    error: NotebookError | null;
}

const empty = (): NotebookState => ({
    notebookId: null,
    meta: null,
    confirmed: null,
    drafts: {},
    tooLarge: {},
    status: 'idle',
    structureBusy: false,
    error: null,
});

/** Стор открытого блокнота: снимок, черновики, очередь сохранения и её статус. */
export const useNotebookStore = create<NotebookState>()(() => empty());

const get = () => useNotebookStore.getState();
const set = (patch: Partial<NotebookState>) => useNotebookStore.setState(patch);

type Op =
    | { type: 'update'; cellId: string; source: string }
    | { type: 'create'; kind: Cell['kind'] }
    | { type: 'move'; cellId: string; index: number }
    | { type: 'delete'; cellId: string };

type Job = { op: Op; done: (result: string | boolean | undefined) => void };

// Поколение меняется при открытии и закрытии блокнота: ответы прежнего в стор не попадают
let generation = 0;
let queue: Job[] = [];
// Поколение, чья очередь сейчас выполняется; null — очередь стоит
let active: number | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const clearTimers = (): void => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    clearTimeout(savedTimer);
};

const reset = (): void => {
    generation++;
    clearTimers();
    for (const job of queue) job.done(undefined);
    queue = [];
};

/**
 * Открывает блокнот: подтверждённый снимок — из bootstrap или `notebooks.get`.
 * @param page данные страницы блокнота
 */
export function openNotebook(page: NotebookPageData): void {
    reset();
    const { id, name, created_at, updated_at, hash, cells } = page.notebook;
    set({
        ...empty(),
        notebookId: id,
        meta: { name, created_at, updated_at },
        confirmed: { hash, cells },
    });
}

/** Закрывает блокнот: ожидающие и поздние ответы больше ничего не меняют. */
export function closeNotebook(): void {
    reset();
    set(empty());
}

const sourceOf = (cellId: string): string | undefined =>
    get().confirmed?.cells.find((c) => c.id === cellId)?.source;

// Статус шапки по текущему состоянию; saved — только когда сохранять больше нечего
const refreshStatus = (justSaved = false): void => {
    const { error, drafts } = get();
    if (error === 'save') return set({ status: 'error' });
    if (active === generation || queue.length > 0) return set({ status: 'saving' });
    if (Object.keys(drafts).length > 0) return set({ status: 'dirty' });
    if (justSaved) {
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => {
            if (get().status === 'saved') set({ status: 'idle' });
        }, SAVED_VISIBLE_MS);
        return set({ status: 'saved' });
    }
    if (get().status !== 'saved') set({ status: 'idle' });
};

/**
 * Ввод пользователя в ячейке. Сохранение — через {@link AUTOSAVE_DELAY_MS} без ввода; во время
 * IME-композиции не отправляется.
 * @param cellId ячейка
 * @param text полный текст
 * @param composing идёт ли IME-композиция
 */
export function editSource(cellId: string, text: string, composing: boolean): void {
    const drafts = { ...get().drafts };
    if (text === sourceOf(cellId)) delete drafts[cellId];
    else drafts[cellId] = text;
    const tooLarge = { ...get().tooLarge };
    if (utf8Bytes(text) > SOURCE_LIMIT_BYTES) tooLarge[cellId] = true;
    else delete tooLarge[cellId];
    set({ drafts, tooLarge });
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
    if (!composing)
        timers.set(
            cellId,
            setTimeout(() => commitSource(cellId), AUTOSAVE_DELAY_MS),
        );
    refreshStatus();
}

/**
 * Немедленно ставит в очередь ожидающую правку ячейки: выход из редактора, конец IME.
 * @param cellId ячейка
 */
export function commitSource(cellId: string): void {
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
    const source = get().drafts[cellId];
    if (source === undefined || get().tooLarge[cellId]) return;
    const queued = queue.find((job) => job.op.type === 'update' && job.op.cellId === cellId);
    if (queued) queued.op = { type: 'update', cellId, source };
    else queue.push({ op: { type: 'update', cellId, source }, done: () => {} });
    void run();
}

const structural = (op: Op): Promise<string | boolean | undefined> => {
    const { promise, resolve } = Promise.withResolvers<string | boolean | undefined>();
    queue.push({ op, done: resolve });
    set({ structureBusy: true });
    void run();
    return promise;
};

/**
 * Добавляет пустую ячейку в конец. Ячейка появляется только после подтверждения сервером.
 * @param kind вид ячейки
 * @returns id новой ячейки или `undefined`, если добавить нельзя или не удалось
 */
export async function addCell(kind: Cell['kind']): Promise<string | undefined> {
    if (!get().confirmed || get().structureBusy) return undefined;
    const result = await structural({ type: 'create', kind });
    return typeof result === 'string' ? result : undefined;
}

/**
 * Перемещает ячейку на одну позицию.
 * @param cellId ячейка
 * @param direction -1 — выше, 1 — ниже
 * @returns подтвердил ли сервер перемещение
 */
export async function moveCell(cellId: string, direction: -1 | 1): Promise<boolean> {
    const cells = get().confirmed?.cells ?? [];
    const index = cells.findIndex((c) => c.id === cellId) + direction;
    if (get().structureBusy || index < 0 || index >= cells.length || index - direction < 0) {
        return false;
    }
    return (await structural({ type: 'move', cellId, index })) === true;
}

/**
 * Удаляет ячейку; её несохранённый текст пропадает только после подтверждения сервером.
 * @param cellId ячейка
 * @returns подтвердил ли сервер удаление
 */
export async function deleteCell(cellId: string): Promise<boolean> {
    if (get().structureBusy || sourceOf(cellId) === undefined) return false;
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
    queue = queue.filter((job) => !(job.op.type === 'update' && job.op.cellId === cellId));
    return (await structural({ type: 'delete', cellId })) === true;
}

// Одна операция с текущим hash; ответ применяется, только если блокнот не сменился
async function execute(job: Job, notebookId: number, hash: string, live: () => boolean) {
    const { op } = job;
    switch (op.type) {
        case 'update': {
            const { cellId, source } = op;
            const res = await trpc.cells.update.mutate({ notebookId, hash, cellId, source });
            if (!live()) return;
            const drafts = { ...get().drafts };
            if (drafts[cellId] === source) delete drafts[cellId];
            set({ confirmed: applyUpdate(get().confirmed!, res.hash, cellId, source), drafts });
            return;
        }
        case 'create': {
            const { kind } = op;
            const res = await trpc.cells.create.mutate({ notebookId, hash, kind, source: '' });
            if (!live()) return;
            const cell = { id: res.cell.id, kind, source: '' };
            set({ confirmed: applyCreate(get().confirmed!, res.hash, cell) });
            return job.done(res.cell.id);
        }
        case 'move': {
            const { cellId, index } = op;
            const res = await trpc.cells.move.mutate({ notebookId, hash, cellId, index });
            if (!live()) return;
            set({ confirmed: applyMove(get().confirmed!, res.hash, cellId, index) });
            return job.done(true);
        }
        case 'delete': {
            const { cellId } = op;
            const res = await trpc.cells.delete.mutate({ notebookId, hash, cellId });
            if (!live()) return;
            const drafts = { ...get().drafts };
            const tooLarge = { ...get().tooLarge };
            delete drafts[cellId];
            delete tooLarge[cellId];
            set({ confirmed: applyDelete(get().confirmed!, res.hash, cellId), drafts, tooLarge });
            return job.done(true);
        }
    }
}

// Очередь одного блокнота: строго по одной операции, каждая с hash предыдущего ответа
async function run(): Promise<void> {
    if (active === generation) return;
    const started = generation;
    const live = () => started === generation;
    active = started;
    refreshStatus();
    while (live() && queue.length > 0) {
        const job = queue.shift()!;
        const { notebookId, confirmed } = get();
        if (notebookId === null || !confirmed) break;
        try {
            await execute(job, notebookId, confirmed.hash, live);
        } catch (error) {
            if (!live()) break;
            job.done(undefined);
            active = null;
            return fail(error);
        }
        if (live() && job.op.type !== 'update') {
            set({ structureBusy: queue.some((j) => j.op.type !== 'update') });
        }
    }
    if (active !== started) return;
    active = null;
    if (live()) refreshStatus(true);
}

// Сбой сохранения: очередь останавливается, черновики остаются (сверка — отдельным шагом)
function fail(error: unknown): void {
    for (const job of queue) job.done(undefined);
    queue = [];
    const appCode = isRpcError(error) ? error.data?.appCode : undefined;
    if (appCode === 'too_many_cells') set({ error: 'too_many_cells', structureBusy: false });
    else set({ error: 'save', structureBusy: false });
    refreshStatus();
}
