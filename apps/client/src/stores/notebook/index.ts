import { create } from '@cdd-team/zustand';
import { isRpcError, trpc, type Cell, type NotebookPageData } from '@api/trpc';
import { applyOp, exceedsBytes, fitBytes, sameStructure, type Op, type Snapshot } from './snapshot';

// Лимит исходника ячейки — 64 КиБ в UTF-8
const SOURCE_LIMIT_BYTES = 65_536;
/** Пауза ввода перед автосохранением. */
export const AUTOSAVE_DELAY_MS = 500;
/** Сколько видна подпись «Сохранено». */
export const SAVED_VISIBLE_MS = 4000;

/** Статус сохранения для шапки. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

/** Ошибка, о которой нужно сообщить на странице. */
export type NotebookError = 'save' | 'notebook_gone' | 'too_many_cells';

/** Конфликт сохранения: пока он не разрешён, фронтовая очередь сохранения стоит. */
export type Conflict =
    | { phase: 'none' }
    | { phase: 'loading' }
    | { phase: 'failed' }
    | { phase: 'ready'; snapshot: Snapshot; dialogOpen: boolean }
    | { phase: 'resolving'; snapshot: Snapshot };

/** Черновик ячейки, которую удалили на сервере: остаётся для копирования, сам не воссоздаётся. */
export type Orphan = { cellId: string; kind: Cell['kind']; text: string; index: number };

/** Итог ожидания сохранения перед запуском. */
export type FlushResult =
    | { ok: true }
    | { ok: false; reason: 'conflict' | 'error' | 'too_large' | 'edited' };

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
    /** Растёт при каждой ошибке сохранения или чтения: страница снова показывает «Повторить» */
    failure: number;
    conflict: Conflict;
    orphans: Orphan[];
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
    failure: 0,
    conflict: { phase: 'none' },
    orphans: [],
});

/** Стор открытого блокнота: снимок, черновики, очередь сохранения и её статус. */
export const useNotebookStore = create<NotebookState>()(() => empty());

const get = () => useNotebookStore.getState();
const set = (patch: Partial<NotebookState>) => useNotebookStore.setState(patch);

type Job = { op: Op; done: (result: string | boolean | undefined) => void };

// Поколение меняется при открытии и закрытии блокнота: ответы прежнего в стор не попадают
let generation = 0;
let queue: Job[] = [];
// Поколение, чья очередь сейчас выполняется; null — очередь стоит
let active: number | null = null;
// Операция, результат которой неизвестен после сбоя сети или 5xx: ждёт сверки со снимком
let pending: Job | null = null;
// Ожидание итога «Сохранить мой текст»: true — сохранено, false — снова конфликт или ошибка
let resolution: ((ok: boolean) => void) | null = null;
// Выполняемая сейчас операция очереди
let inflight: Job | null = null;
// Ячейки, чьё удаление ждёт или идёт: их правки больше не отправляются
const deleting = new Set<string>();
// Идёт сверка после сбоя: «Повторить» в это время не запускает вторую
let reconciling = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const clearTimers = (): void => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    clearTimeout(savedTimer);
};

const reset = (): void => {
    generation++;
    inflight?.done(undefined);
    inflight = null;
    reconciling = false;
    clearTimers();
    dropQueue();
    resolution?.(false);
    resolution = null;
};

// Сброс очереди: структурные операции не воспроизводятся, правки снова берутся из черновиков
function dropQueue(): void {
    for (const job of [...queue, ...(pending ? [pending] : [])]) job.done(undefined);
    queue = [];
    pending = null;
    deleting.clear();
}

// Ошибка, после которой сохранение стоит до перечитывания
const halted = (error: NotebookError | null): boolean =>
    error === 'save' || error === 'notebook_gone';

const cancelAutosave = (cellId: string): void => {
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
};

// Конфликт, который ждёт выбора версии или загрузки снимка
const unresolved = (conflict: Conflict): boolean =>
    conflict.phase !== 'none' && conflict.phase !== 'resolving';

// Очередь стоит при неразрешённом конфликте и при ошибке, требующей перечитывания
const paused = (): boolean => {
    const { conflict, error } = get();
    return unresolved(conflict) || halted(error);
};

const edits = new Set<(cellId: string) => void>();
const saves = new Set<(snapshot: Snapshot) => void>();

/**
 * Подписка на реальный ввод пользователя (не на загрузку и снимки): для сигнала активности исполнения.
 * @param listener вызывается с id ячейки
 * @returns отписка
 */
export function onEdit(listener: (cellId: string) => void): () => void {
    edits.add(listener);
    return () => edits.delete(listener);
}

/**
 * Подписка на каждое подтверждение изменения сервером.
 * @param listener вызывается с новым подтверждённым снимком
 * @returns отписка
 */
export function onSaved(listener: (snapshot: Snapshot) => void): () => void {
    saves.add(listener);
    return () => saves.delete(listener);
}

/**
 * Заблокированы ли добавление, перемещение и удаление ячеек.
 * @param state состояние стора
 * @returns true во время структурной операции, пока конфликт не разрешён и пока сохранение стоит
 *   из-за ошибки
 */
export function structureLocked(state: NotebookState): boolean {
    return state.structureBusy || state.conflict.phase !== 'none' || halted(state.error);
}

type Unsaved = Pick<NotebookState, 'drafts' | 'tooLarge' | 'orphans'> & { confirmed: Snapshot };

// Несохранённое покинутых блокнотов этой вкладки: вернётся при следующем открытии блокнота
const unsaved = new Map<number, Unsaved>();

const keepUnsaved = (): void => {
    const { notebookId, confirmed, drafts, tooLarge, orphans } = get();
    if (notebookId === null || !confirmed) return;
    if (Object.keys(drafts).length === 0 && orphans.length === 0) return;
    unsaved.set(notebookId, { confirmed, drafts, tooLarge, orphans });
};

/**
 * Открывает блокнот: подтверждённый снимок — из bootstrap или `notebooks.get`. Несохранённое с
 * прошлого открытия возвращается: блокнот не менялся — правки уходят снова, изменился — выбор версии.
 * @param page данные страницы блокнота
 */
export function openNotebook(page: NotebookPageData): void {
    keepUnsaved();
    reset();
    const { id, name, created_at, updated_at, hash, cells } = page.notebook;
    const fresh = { hash, cells };
    const kept = unsaved.get(id);
    unsaved.delete(id);
    const changed = kept !== undefined && kept.confirmed.hash !== hash;
    set({
        ...empty(),
        ...kept,
        notebookId: id,
        meta: { name, created_at, updated_at },
        confirmed: changed ? kept.confirmed : fresh,
    });
    if (!kept) return;
    if (changed) return enterConflict(fresh);
    for (const cellId of Object.keys(kept.drafts)) commitSource(cellId);
    refreshStatus();
}

/**
 * Уход со страницы блокнота: несохранённые правки отправляются сразу, очередь дорабатывает в фоне.
 * Что отправить нельзя (больше лимита, конфликт, ошибка), вернётся при открытии блокнота.
 * Ответы не попадут в другой блокнот — его открытие начинает новое поколение.
 */
export function leaveNotebook(): void {
    for (const cellId of Object.keys(get().drafts)) commitSource(cellId);
}

/** Закрывает блокнот и забывает несохранённое: ожидающие и поздние ответы больше ничего не меняют. */
export function closeNotebook(): void {
    reset();
    unsaved.clear();
    set(empty());
}

const sourceOf = (cellId: string): string | undefined =>
    get().confirmed?.cells.find((c) => c.id === cellId)?.source;

// Статус меняется только при новом значении: на каждое нажатие не уведомлять подписчиков зря
const setStatus = (status: SaveStatus): void => {
    if (get().status !== status) set({ status });
};

// Статус шапки по текущему состоянию; saved — только когда сохранять больше нечего
const refreshStatus = (justSaved = false): void => {
    const { error, drafts, conflict } = get();
    if (unresolved(conflict)) return setStatus('conflict');
    if (halted(error)) return setStatus('error');
    if (active === generation || queue.length > 0) return setStatus('saving');
    if (Object.keys(drafts).length > 0) return setStatus('dirty');
    if (justSaved) {
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => {
            if (get().status === 'saved') setStatus('idle');
        }, SAVED_VISIBLE_MS);
        return setStatus('saved');
    }
    if (get().status !== 'saved') setStatus('idle');
};

/**
 * Какая часть вставки помещается в лимит исходника: больше 64 КиБ всё равно не сохранить, а
 * огромный редактор Chrome рисует со вспышками.
 * @param text текст ячейки до вставки
 * @param start начало выделения
 * @param end конец выделения: выделенное заменяется вставкой
 * @param pasted вставляемый текст
 * @returns вставка целиком или её помещающееся начало
 */
export function pastedPart(text: string, start: number, end: number, pasted: string): string {
    const rest = text.slice(0, start) + text.slice(end);
    const used = exceedsBytes(rest, SOURCE_LIMIT_BYTES)
        ? SOURCE_LIMIT_BYTES
        : new TextEncoder().encode(rest).length;
    return fitBytes(pasted, SOURCE_LIMIT_BYTES - used);
}

/**
 * Ввод пользователя в ячейке. Сохранение — через {@link AUTOSAVE_DELAY_MS} без ввода; во время
 * IME-композиции не отправляется.
 * @param cellId ячейка
 * @param text полный текст
 * @param composing идёт ли IME-композиция
 */
export function editSource(cellId: string, text: string, composing: boolean): void {
    const keep = text !== sourceOf(cellId) || updateUnconfirmed(cellId);
    const big = exceedsBytes(text, SOURCE_LIMIT_BYTES);
    const state = get();
    const patch: Partial<NotebookState> = {};
    if (keep ? state.drafts[cellId] !== text : cellId in state.drafts) {
        const { [cellId]: _, ...rest } = state.drafts;
        patch.drafts = keep ? { ...rest, [cellId]: text } : rest;
    }
    if (big !== (state.tooLarge[cellId] === true)) {
        const { [cellId]: _, ...rest } = state.tooLarge;
        patch.tooLarge = big ? { ...rest, [cellId]: true } : rest;
    }
    if (patch.drafts || patch.tooLarge) set(patch);
    cancelAutosave(cellId);
    for (const listener of edits) listener(cellId);
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
    cancelAutosave(cellId);
    const source = get().drafts[cellId];
    if (source === undefined || get().tooLarge[cellId] || deleting.has(cellId)) return;
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
 * Добавляет пустую ячейку. Ячейка появляется только после подтверждения сервером.
 * @param kind вид ячейки
 * @param index позиция с нуля; без неё — в конец
 * @returns id новой ячейки или `undefined`, если добавить нельзя или не удалось
 */
export async function addCell(kind: Cell['kind'], index?: number): Promise<string | undefined> {
    if (!get().confirmed || get().structureBusy || paused()) return undefined;
    if (get().error === 'too_many_cells') set({ error: null });
    const result = await structural({ type: 'create', kind, index });
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
    const from = cells.findIndex((c) => c.id === cellId);
    const index = from + direction;
    if (get().structureBusy || paused() || from < 0 || index < 0 || index >= cells.length) {
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
    if (get().structureBusy || paused() || sourceOf(cellId) === undefined) return false;
    cancelAutosave(cellId);
    queue = queue.filter((job) => !(job.op.type === 'update' && job.op.cellId === cellId));
    deleting.add(cellId);
    const deleted = (await structural({ type: 'delete', cellId })) === true;
    deleting.delete(cellId);
    // ячейка осталась: её черновик снова ждёт сохранения
    if (!deleted) commitSource(cellId);
    return deleted;
}

// Подтверждённая операция: новый снимок, черновик снимается, только если он равен отправленному
function commit(job: Job, confirmed: Snapshot, createdId?: string): void {
    const { op } = job;
    const drafts = { ...get().drafts };
    const tooLarge = { ...get().tooLarge };
    if (op.type === 'update' && drafts[op.cellId] === op.source) delete drafts[op.cellId];
    if (op.type === 'delete') {
        delete drafts[op.cellId];
        delete tooLarge[op.cellId];
    }
    set({ confirmed, drafts, tooLarge });
    job.done(op.type === 'create' ? createdId : true);
    for (const listener of saves) listener(confirmed);
}

// Снимок после операции, если она применилась; для create — и id созданной ячейки
function expectedAfter(
    confirmed: Snapshot,
    op: Op,
    server: Snapshot,
): { snapshot: Snapshot; createdId?: string } | null {
    if (op.type !== 'create') return { snapshot: applyOp(confirmed, server.hash, op) };
    const known = new Set(confirmed.cells.map((c) => c.id));
    const added = server.cells.filter((c) => !known.has(c.id));
    if (added.length !== 1) return null;
    const createdId = added[0]!.id;
    return { snapshot: applyOp(confirmed, server.hash, op, createdId), createdId };
}

// Запрос операции с текущим hash: новый hash и, для create, id ячейки
async function send(
    op: Op,
    notebookId: number,
    hash: string,
): Promise<{ hash: string; createdId?: string }> {
    switch (op.type) {
        case 'update':
            return trpc.cells.update.mutate({
                notebookId,
                hash,
                cellId: op.cellId,
                source: op.source,
            });
        case 'create': {
            const res = await trpc.cells.create.mutate({
                notebookId,
                hash,
                kind: op.kind,
                source: '',
                index: op.index,
            });
            return { hash: res.hash, createdId: res.cell.id };
        }
        case 'move':
            return trpc.cells.move.mutate({ notebookId, hash, cellId: op.cellId, index: op.index });
        case 'delete':
            return trpc.cells.delete.mutate({ notebookId, hash, cellId: op.cellId });
    }
}

// У ячейки есть отправленная или ждущая отправки правка, ещё не подтверждённая сервером
const isUpdateOf = (job: Job | null, cellId: string): boolean =>
    job?.op.type === 'update' && job.op.cellId === cellId;
const updateUnconfirmed = (cellId: string): boolean =>
    isUpdateOf(inflight, cellId) ||
    isUpdateOf(pending, cellId) ||
    queue.some((job) => isUpdateOf(job, cellId));

const structureQueued = (): boolean => queue.some((j) => j.op.type !== 'update');

// Очередь одного блокнота: строго по одной операции, каждая с hash предыдущего ответа
async function run(): Promise<void> {
    if (active === generation || paused()) return;
    const started = generation;
    const live = () => started === generation;
    active = started;
    refreshStatus();
    while (live() && !paused() && queue.length > 0) {
        const job = queue.shift()!;
        const { notebookId, confirmed } = get();
        if (notebookId === null || !confirmed) break;
        inflight = job;
        try {
            const res = await send(job.op, notebookId, confirmed.hash);
            // ответ применяется, только если блокнот не сменился
            if (live()) {
                const next = applyOp(get().confirmed!, res.hash, job.op, res.createdId);
                commit(job, next, res.createdId);
            }
        } catch (error) {
            if (!live()) break;
            inflight = null;
            active = null;
            return failed(job, error);
        } finally {
            // failed() мог уже запустить очередь заново: её операцию не трогаем
            if (inflight === job) inflight = null;
        }
        if (live() && job.op.type !== 'update') set({ structureBusy: structureQueued() });
    }
    if (active !== started) return;
    active = null;
    if (!live()) return;
    if (queue.length === 0) finishResolving(true);
    refreshStatus(!paused());
}

// Категории ошибок, после которых запись могла состояться
const UNKNOWN_RESULT = new Set([
    'BAD_GATEWAY',
    'INTERNAL_SERVER_ERROR',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
]);

// Сбой операции. Сеть и 5xx: запись могла состояться — перечитать и сверить, вслепую не повторять
function failed(job: Job, error: unknown): void {
    const code = isRpcError(error) ? error.data?.code : undefined;
    const appCode = isRpcError(error) ? error.data?.appCode : undefined;
    if (appCode === 'too_many_cells') {
        job.done(undefined);
        set({ error: 'too_many_cells', structureBusy: structureQueued() });
        return void run();
    }
    if (appCode === 'notebook_conflict' || code === 'NOT_FOUND') {
        job.done(undefined);
        return void startConflict();
    }
    pending = code === undefined || UNKNOWN_RESULT.has(code) ? job : null;
    if (!pending) job.done(undefined);
    finishResolving(false);
    set({ error: 'save', failure: get().failure + 1 });
    refreshStatus();
    void reconcile();
}

type Loaded = { snapshot: Snapshot } | { error: 'gone' | 'failed' };

// Свежий снимок блокнота; ошибка чтения не стирает экран
async function load(live: () => boolean): Promise<Loaded | null> {
    const id = get().notebookId;
    if (id === null) return null;
    try {
        const { notebook } = await trpc.notebooks.get.query({ id });
        return live() ? { snapshot: { hash: notebook.hash, cells: notebook.cells } } : null;
    } catch (error) {
        if (!live()) return null;
        const gone = isRpcError(error) && error.data?.code === 'NOT_FOUND';
        return { error: gone ? 'gone' : 'failed' };
    }
}

const loadFailed = (result: { error: 'gone' | 'failed' }): void => {
    set({
        error: result.error === 'gone' ? 'notebook_gone' : 'save',
        failure: get().failure + 1,
    });
    refreshStatus();
};

// Сверка после сбоя: применилась ли операция и нет ли на сервере чужих изменений
async function reconcile(): Promise<void> {
    if (reconciling) return;
    reconciling = true;
    const started = generation;
    const result = await load(() => started === generation);
    reconciling = false;
    if (!result) return;
    if ('error' in result) return loadFailed(result);
    const server = result.snapshot;
    const confirmed = get().confirmed!;
    const job = pending;
    pending = null;
    const expected = job ? expectedAfter(confirmed, job.op, server) : null;
    if (job && expected && sameStructure(server, expected.snapshot)) {
        set({ error: null });
        commit(job, server, expected.createdId);
    } else if (sameStructure(server, confirmed)) {
        set({ error: null, confirmed: server });
        if (job) queue.unshift(job);
    } else {
        job?.done(undefined);
        set({ error: null });
        return enterConflict(server);
    }
    set({ structureBusy: structureQueued() });
    if (queue.length > 0) return void run();
    finishResolving(true);
    refreshStatus(true);
}

/** Повтор после ошибки сохранения или чтения: снова перечитать и сверить, без слепой записи. */
export async function retry(): Promise<void> {
    if (get().error === 'save') await reconcile();
}

// Конфликт с уже полученным снимком: диалог выбора версии открывается сразу
function enterConflict(snapshot: Snapshot): void {
    dropQueue();
    set({ conflict: { phase: 'ready', snapshot, dialogOpen: true }, structureBusy: false });
    refreshStatus();
}

// 409 notebook_conflict: очередь стоит, черновики остаются, загружается свежий снимок
async function startConflict(): Promise<void> {
    finishResolving(false);
    dropQueue();
    set({ conflict: { phase: 'loading' }, structureBusy: false });
    refreshStatus();
    const started = generation;
    const result = await load(() => started === generation);
    if (!result) return;
    if ('error' in result && result.error === 'gone') {
        set({ conflict: { phase: 'none' } });
        return loadFailed(result);
    }
    if ('error' in result) {
        set({ conflict: { phase: 'failed' } });
        return refreshStatus();
    }
    enterConflict(result.snapshot);
}

// Конфликт снят, если не начался новый. Успех — только когда сохранено всё: черновик больше
// лимита на сервер не ушёл и останется несохранённым, пока его не сократят
function finishResolving(ok: boolean): void {
    if (get().conflict.phase !== 'resolving') return;
    if (ok || !unresolved(get().conflict)) set({ conflict: { phase: 'none' } });
    const { drafts, tooLarge } = get();
    const saved = ok && !Object.keys(drafts).some((cellId) => tooLarge[cellId]);
    const done = resolution;
    resolution = null;
    done?.(saved);
}

/** Повторная загрузка свежего снимка после её ошибки. */
export async function retryConflictLoad(): Promise<void> {
    if (get().conflict.phase === 'failed') await startConflict();
}

/** Снова открывает диалог выбора версии: «Разрешить конфликт», ▶ и «Запустить всё» при конфликте. */
export function openConflictDialog(): void {
    const { conflict } = get();
    if (conflict.phase === 'ready') set({ conflict: { ...conflict, dialogOpen: true } });
}

/** Закрывает диалог без выбора версии: черновики и пауза очереди остаются. */
export function closeConflictDialog(): void {
    const { conflict } = get();
    if (conflict.phase === 'ready') set({ conflict: { ...conflict, dialogOpen: false } });
}

/**
 * Выбор версии при конфликте. «server» — принять свежий снимок и отбросить несохранённое;
 * «mine» — сохранить свои исходники затронутых ячеек поверх свежей версии с её hash.
 * Черновики ячеек, удалённых на сервере, остаются в `orphans` и не воссоздаются.
 * @param choice выбранная версия
 * @returns true, если всё сохранено; false — снова конфликт, ошибка или остался черновик больше
 *   лимита (он не отправлен и ждёт сокращения)
 */
export function resolveConflict(choice: 'server' | 'mine'): Promise<boolean> {
    const { conflict, drafts, tooLarge, confirmed } = get();
    if (conflict.phase !== 'ready') return Promise.resolve(false);
    const { snapshot } = conflict;
    dropQueue();
    if (choice === 'server') {
        set({
            confirmed: snapshot,
            drafts: {},
            tooLarge: {},
            orphans: [],
            conflict: { phase: 'none' },
        });
        refreshStatus(true);
        return Promise.resolve(true);
    }
    const present = new Set(snapshot.cells.map((c) => c.id));
    const kept: Record<string, string> = {};
    const orphans = [...get().orphans];
    for (const [cellId, text] of Object.entries(drafts)) {
        if (present.has(cellId)) {
            kept[cellId] = text;
            continue;
        }
        const index = confirmed?.cells.findIndex((c) => c.id === cellId) ?? -1;
        const kind = confirmed?.cells[index]?.kind ?? 'code';
        orphans.push({ cellId, kind, text, index: index === -1 ? snapshot.cells.length : index });
    }
    set({
        confirmed: snapshot,
        drafts: kept,
        orphans,
        conflict: { phase: 'resolving', snapshot },
    });
    const { promise, resolve } = Promise.withResolvers<boolean>();
    resolution = resolve;
    for (const [cellId, source] of Object.entries(kept)) {
        if (!tooLarge[cellId])
            queue.push({ op: { type: 'update', cellId, source }, done: () => {} });
    }
    if (queue.length === 0) finishResolving(true);
    else void run();
    refreshStatus(queue.length === 0);
    return promise;
}

/**
 * Убирает черновик удалённой на сервере ячейки.
 * @param cellId ячейка
 */
export function dismissOrphan(cellId: string): void {
    set({ orphans: get().orphans.filter((o) => o.cellId !== cellId) });
}

/**
 * Перед запуском кода: немедленно отправить ожидающие правки выбранных ячеек и структурные операции
 * и дождаться подтверждения. Конфликт, ошибка, лимит или новый ввод этих ячеек за время ожидания —
 * отказ; разрешение конфликта отказ не отменяет, запуск нужно нажать заново.
 * @param cellIds ячейки, чей код будет исполнен; без них — все несохранённые
 * @returns итог ожидания
 */
export function flush(cellIds?: string[]): Promise<FlushResult> {
    const start = get();
    const started = generation;
    if (start.conflict.phase !== 'none') return Promise.resolve({ ok: false, reason: 'conflict' });
    if (paused()) return Promise.resolve({ ok: false, reason: 'error' });
    const targets = cellIds ?? Object.keys(start.drafts);
    if (targets.some((id) => start.tooLarge[id])) {
        return Promise.resolve({ ok: false, reason: 'too_large' });
    }
    const watched = new Set(targets);
    for (const id of targets) commitSource(id);
    return new Promise((resolve) => {
        let finished = false;
        const cleanup: (() => void)[] = [];
        const finish = (result: FlushResult) => {
            if (finished) return;
            finished = true;
            for (const off of cleanup) off();
            resolve(result);
        };
        cleanup.push(
            onEdit((cellId) => {
                if (watched.has(cellId)) finish({ ok: false, reason: 'edited' });
            }),
        );
        const check = () => {
            const state = get();
            if (started !== generation) return finish({ ok: false, reason: 'error' });
            if (state.conflict.phase !== 'none') return finish({ ok: false, reason: 'conflict' });
            if (paused()) return finish({ ok: false, reason: 'error' });
            const busy = active === generation || queue.length > 0 || pending !== null;
            if (!busy && targets.every((id) => state.drafts[id] === undefined)) {
                finish({ ok: true });
            }
        };
        cleanup.push(useNotebookStore.subscribe(check));
        check();
    });
}
