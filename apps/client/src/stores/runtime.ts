import { create } from '@cdd-team/zustand';
import type { RouterOutputs } from '@cdd/bff';
import { isRpcError, trpc, type NotebookPageData } from '@api/trpc';
import {
    UNKNOWN_RESULT,
    applyResult,
    flush,
    onEdit,
    openConflictDialog,
    recheck,
    resultsSaved,
    useNotebookStore,
} from '@stores/notebook';

type Updates = RouterOutputs['runtime']['updates'];

/** Runtime-сессия пользователя, как её отдаёт Go. */
export type RuntimeSession = Updates['session'];

/** Снимок исполнения: состояние, вывод, сохранение результата. */
export type RuntimeExecution = Updates['executions'][number];

/** Незавершённое исполнение в очереди сессии. */
export type QueueItem = Updates['runtime_queue']['items'][number];

/** Итог наблюдаемого запуска для шапки. */
export type RunOutcome = 'running' | 'queued' | 'succeeded' | 'failed' | 'unknown' | 'stopped';

/** Почему команда не выполнена. */
export type RuntimeError =
    | 'network'
    | 'queue_full'
    | 'unavailable'
    | 'conflict'
    | 'too_large'
    | 'failed';

/** Обычный интервал между обходами опроса. */
export const POLL_INTERVAL_MS = 2000;
/** Сколько видна подпись «Выполнено». */
export const SUCCESS_VISIBLE_MS = 4000;
/** Не чаще одного сигнала активности за это время. */
export const ACTIVITY_INTERVAL_MS = 30_000;
// Лимит execution IDs одного вызова runtime.updates — не лимит размера запуска
const CHUNK = 100;

const ENDED = new Set<RuntimeSession['state']>(['STOPPED', 'FAILED']);
const TERMINAL = new Set<RuntimeExecution['state']>([
    'SUCCEEDED',
    'FAILED',
    'INTERRUPTED',
    'TIMED_OUT',
    'CANCELLED',
    'UNKNOWN',
    'REJECTED',
]);

interface RuntimeState {
    /** Открытый блокнот; null — страница блокнота не открыта */
    notebookId: number | null;
    /** Активная сессия пользователя — может принадлежать другому блокноту */
    session: RuntimeSession | null;
    /** Текущая очередь своей сессии: RUNNING первым */
    queue: QueueItem[];
    /** Снимки исполнений этой страницы по execution_id */
    executions: Record<string, RuntimeExecution>;
    /** Последнее исполнение ячейки по cell_id: его результат и состояние показываются у ячейки */
    latest: Record<string, string>;
    /** Полный состав наблюдаемого запуска: одна ячейка или весь Run all */
    run: string[] | null;
    /** Итог наблюдаемого запуска; null — нечего показывать */
    outcome: RunOutcome | null;
    /** Команда, чьё принятие ещё не разрешилось: второе нажатие не создаёт второй запуск */
    busy: 'start' | 'execute' | 'stop' | null;
    error: RuntimeError | null;
    /** Команда исполнения с неизвестным результатом ждёт повтора: новые запуски недоступны */
    awaitingRetry: boolean;
    /** Окружение не запустилось: отказ Go, а не сбой связи */
    startFailed: boolean;
    /** Растёт при каждой ошибке команды: страница снова показывает сообщение */
    failure: number;
    /** Последний вызов runtime.updates не удался: экран прежний, опрос повторяется */
    linkLost: boolean;
    /** Растёт, когда наблюдаемая сессия стала READY: снекбар «Окружение готово» */
    ready: number;
}

const empty = (): RuntimeState => ({
    notebookId: null,
    session: null,
    queue: [],
    executions: {},
    latest: {},
    run: null,
    outcome: null,
    busy: null,
    error: null,
    awaitingRetry: false,
    startFailed: false,
    failure: 0,
    linkLost: false,
    ready: 0,
});

/** Стор окружения открытого блокнота: сессия, очередь, исполнения, итог запуска и опрос. */
export const useRuntimeStore = create<RuntimeState>()(() => empty());

const get = () => useRuntimeStore.getState();
const set = (patch: Partial<RuntimeState>) => useRuntimeStore.setState(patch);

// Поколение меняется при открытии, закрытии и смене сессии: поздние ответы прежних не применяются
let generation = 0;
// Курсор последней успешно применённой страницы событий
let cursor = 0;
// Обход отслеживаемых IDs: состав фиксируется в начале, порции по CHUNK идут подряд
let pass: string[] = [];
let offset = 0;
let polling = false;
// Опрос нужен сразу после текущего: принятая команда или stop во время запроса
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let successTimer: ReturnType<typeof setTimeout> | undefined;
// Исполнения, начатые или увиденные незавершёнными на этой странице. Завершённые до неё — история:
// их результат уже в content, повтор журнала не подменяет его
const live = new Set<string>();
// Ключ запуска окружения ждёт повтора после сбоя сети
let startRequest: string | undefined;
// Команда исполнения, чей результат неизвестен после сбоя: повтор — с теми же ID и телом
let unsent: Command | null = null;
// stop с неизвестным результатом: «Повторить» отправляет его снова, stop идемпотентен
let stopUnsure = false;
// Последний seq журнала на момент открытия: исполнения из событий до него — история, после — новые,
// в том числе завершённые в другой вкладке между опросами
let replayUntil = 0;
let lastActivity = Number.NEGATIVE_INFINITY;

type Command =
    | { kind: 'execute'; body: { execution_id: string; cell_id: string; source_hash: string } }
    | {
          kind: 'executeAll';
          body: { request_id: string; cells: { cell_id: string; source_hash: string }[] };
      };

const own = (state: RuntimeState = get()): RuntimeSession | null =>
    state.session && state.session.notebook_id === state.notebookId ? state.session : null;

const resetTracking = (): void => {
    generation++;
    cursor = 0;
    pass = [];
    offset = 0;
    polling = false;
    again = false;
    clearTimeout(timer);
    clearTimeout(successTimer);
    live.clear();
    unsent = null;
    stopUnsure = false;
    replayUntil = 0;
};

/**
 * Окружение при открытии блокнота: активная сессия и очередь из первоначальной загрузки. Своя
 * сессия — наблюдение с начала журнала; спиннеры сразу из снимка очереди, без ожидания replay.
 * @param page данные страницы блокнота
 */
export function openRuntime(page: NotebookPageData): void {
    resetTracking();
    startRequest = undefined;
    const queue = page.runtime_queue?.items ?? [];
    set({ ...empty(), notebookId: page.notebook.id, session: page.active_session });
    if (!own()) return;
    replayUntil = page.active_session?.public_seq ?? 0;
    track(queue);
    set({ queue });
    kick();
}

/** Уход со страницы: опрос прекращается, поздние ответы не применяются. Окружение не останавливается. */
export function closeRuntime(): void {
    resetTracking();
    startRequest = undefined;
    lastActivity = Number.NEGATIVE_INFINITY;
    set(empty());
}

// Новые живые исполнения: порядок появления — порядок свежести для ячейки
function track(items: { execution_id: string; cell_id: string }[]): void {
    let latest: Record<string, string> | undefined;
    for (const { execution_id, cell_id } of items) {
        if (live.has(execution_id)) continue;
        live.add(execution_id);
        latest ??= { ...get().latest };
        latest[cell_id] = execution_id;
    }
    if (latest) set({ latest });
}

// Ещё нужны обновления: снимка нет, исполнение не завершено или результат ждёт сохранения
const needed = (id: string): boolean => {
    const snapshot = get().executions[id];
    return !snapshot || !TERMINAL.has(snapshot.state) || snapshot.projection === 'pending';
};

/**
 * Есть ли завершённые исполнения, чей результат ещё сохраняется: «Сохраняем результаты…».
 * @param state состояние стора
 * @returns true, если хоть один результат ждёт сохранения
 */
export function resultsPending(state: RuntimeState): boolean {
    return Object.values(state.executions).some(
        (e) => TERMINAL.has(e.state) && e.projection === 'pending',
    );
}

/**
 * Статус запуска в шапке: очередь важнее итога, пока в ней что-то есть.
 * @param state состояние стора
 * @returns статус или null — шапка без статуса выполнения
 */
export function runStatus(state: RuntimeState): RunOutcome | null {
    if (!own(state)) return state.outcome;
    if (state.queue.some((item) => item.state === 'RUNNING')) return 'running';
    if (state.queue.length > 0) return 'queued';
    return state.outcome;
}

/**
 * Может ли окружение исполнять код этого блокнота сейчас.
 * @param state состояние стора
 * @returns true, если своя сессия READY, команда не ждёт принятия и нет команды, ждущей повтора
 */
export function canExecute(state: RuntimeState): boolean {
    return own(state)?.state === 'READY' && state.busy === null && !state.awaitingRetry;
}

/**
 * Занимает ли сессия слот пользователя: до подтверждённого завершения, включая очистку.
 * @param session сессия
 * @returns true для всех состояний, кроме STOPPED и FAILED
 */
export function sessionActive(session: RuntimeSession | null): boolean {
    return session !== null && !ENDED.has(session.state);
}

// Опрос сразу: после команды, stop и при открытии. Цепочка одна: идущий запрос не дублируется
function kick(): void {
    if (!own()) return;
    clearTimeout(timer);
    if (polling) {
        again = true;
        return;
    }
    void poll();
}

async function poll(): Promise<void> {
    const session = own();
    if (!session) return;
    const started = generation;
    polling = true;
    again = false;
    if (offset === 0) pass = [...live].filter(needed);
    let delay = POLL_INTERVAL_MS;
    let more = false;
    try {
        const res = await trpc.runtime.updates.query({
            sessionId: session.id,
            after: cursor,
            executionIds: pass.slice(offset, offset + CHUNK),
        });
        if (started !== generation) return;
        apply(res);
        cursor = res.next_cursor;
        offset += CHUNK;
        if (offset >= pass.length) offset = 0;
        more = res.has_more || offset > 0;
        if (more) delay = 0;
        if (get().linkLost) set({ linkLost: false });
    } catch {
        if (started !== generation) return;
        // курсор и текущая порция прежние: повтор того же шага
        set({ linkLost: true });
        more = true;
    }
    polling = false;
    if (!more && finished()) return;
    timer = setTimeout(() => void poll(), again ? 0 : delay);
}

// Сессия завершена и хвост дочитан: опрос больше не нужен. Недочитанные исполнения запуска —
// неизвестный результат, а не вечное «выполняется»
function finished(): boolean {
    const session = own();
    if (session && !ENDED.has(session.state)) return false;
    // результат уже исполненного кода ещё сохраняется: дочитать, иначе «Сохраняем результаты…» навсегда
    if (resultsPending(get())) return false;
    const { run, outcome, executions } = get();
    const open = (id: string) => {
        const state = executions[id]?.state;
        return state === undefined || !TERMINAL.has(state);
    };
    if (run && outcome === 'running' && run.some(open)) set({ outcome: 'unknown' });
    return true;
}

function apply(res: Updates): void {
    const before = get();
    const wasReady = before.session?.state === 'READY';
    track(res.runtime_queue.items);
    const executions = { ...before.executions };
    let stored = false;
    const recent = new Set<unknown>(
        res.events.filter((e) => e.seq > replayUntil).map((e) => e.body.execution_id),
    );
    for (const execution of res.executions) {
        const id = execution.execution_id;
        const fresh =
            !TERMINAL.has(execution.state) || execution.projection === 'pending' || recent.has(id);
        if (!live.has(id) && !fresh) continue;
        track([execution]);
        if (executions[id]?.projection === 'pending' && execution.projection === 'applied') {
            stored = true;
        }
        executions[id] = execution;
        void showResult(execution);
    }
    set({
        session: res.session,
        queue: res.runtime_queue.items,
        executions,
        ready: !wasReady && res.session.state === 'READY' ? before.ready + 1 : before.ready,
    });
    evaluate();
    if (stored && !resultsPending(get())) resultsSaved();
}

// Вывод последнего исполнения ячейки — в её подтверждённый снимок, если исполнялся её текущий
// исходник. Поздний результат старого source и конфликт сохранения его не заменяют
async function showResult(execution: RuntimeExecution): Promise<void> {
    const { cell_id, execution_id, projection } = execution;
    if (projection === 'conflict' || get().latest[cell_id] !== execution_id) return;
    const cell = useNotebookStore.getState().confirmed?.cells.find((c) => c.id === cell_id);
    if (cell?.kind !== 'code') return;
    const started = generation;
    if ((await sha256(cell.source)) !== execution.source_hash || started !== generation) return;
    if (get().latest[cell_id] !== execution_id) return;
    const { outputs, execution_count, output_truncated } = execution;
    applyResult(cell_id, cell.source, { outputs, execution_count, output_truncated });
}

// Итог по всем попыткам запуска. Объявленный итог поздние ответы не меняют
function evaluate(): void {
    const { run, executions, outcome } = get();
    if (!run || (outcome !== null && outcome !== 'running')) return;
    const states = run.map((id) => executions[id]?.state);
    if (states.some((state) => state === undefined || !TERMINAL.has(state))) {
        if (outcome !== 'running') set({ outcome: 'running' });
        return;
    }
    set({ outcome: outcomeOf(states as RuntimeExecution['state'][]) });
    if (get().outcome !== 'succeeded') return;
    const shown = run;
    successTimer = setTimeout(() => {
        if (get().run === shown) set({ run: null, outcome: null });
    }, SUCCESS_VISIBLE_MS);
}

// Приоритет смешанного итога: неизвестный → ошибка → остановка → успех
const outcomeOf = (states: RuntimeExecution['state'][]): RunOutcome => {
    if (states.includes('UNKNOWN')) return 'unknown';
    if (states.some((s) => s === 'FAILED' || s === 'REJECTED' || s === 'TIMED_OUT')) {
        return 'failed';
    }
    if (states.some((s) => s === 'CANCELLED' || s === 'INTERRUPTED')) return 'stopped';
    return 'succeeded';
};

/**
 * SHA-256 исходника в UTF-8, как его проверяет Go.
 * @param text исходник
 * @returns 64 шестнадцатеричных символа
 */
export async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const fail = (error: RuntimeError): void => set({ error, failure: get().failure + 1 });

// Сбой, после которого команда могла быть принята: повтор — только с теми же ID и телом
const uncertain = (error: unknown): boolean =>
    !isRpcError(error) || UNKNOWN_RESULT.has(error.data?.code ?? '');

const errorOf = (error: unknown): RuntimeError => {
    if (uncertain(error)) return 'network';
    switch (isRpcError(error) ? error.data?.appCode : undefined) {
        case 'queue_full':
            return 'queue_full';
        case 'runtime_unavailable':
            return 'unavailable';
        case 'conflict':
            return 'conflict';
        default:
            return 'failed';
    }
};

// Наблюдение за другой сессией: прежние исполнения и курсор к ней не относятся
function observe(session: RuntimeSession): void {
    if (get().session?.id !== session.id) {
        resetTracking();
        set({
            queue: [],
            executions: {},
            latest: {},
            run: null,
            outcome: null,
            awaitingRetry: false,
        });
    }
    const wasReady = get().session?.state === 'READY';
    set({ session, ready: !wasReady && session.state === 'READY' ? get().ready + 1 : get().ready });
    kick();
}

/**
 * «Запустить окружение» Python. Подготовка не исполняет код. Повтор после сбоя сети — с прежним
 * `request_id`. Активная сессия другого блокнота не заменяется: она приходит в `session`.
 */
export async function startRuntime(): Promise<void> {
    const { notebookId, session, busy } = get();
    if (notebookId === null || busy !== null || sessionActive(session)) return;
    startRequest ??= crypto.randomUUID();
    const started = generation;
    set({ busy: 'start', error: null, startFailed: false });
    try {
        const created = await trpc.runtime.start.mutate({ notebookId, requestId: startRequest });
        if (started !== generation) return;
        startRequest = undefined;
        set({ busy: null });
        observe(created);
    } catch (error) {
        if (started !== generation) return;
        set({ busy: null });
        if (uncertain(error)) return fail('network');
        startRequest = undefined;
        const current = isRpcError(error) ? error.data?.activeSession : undefined;
        // состояние могло измениться после первоначальной загрузки: показываем занятую сессию
        if (current) return observe(current);
        set({ startFailed: true });
    }
}

/**
 * «Выполнить» сохранённую кодовую ячейку: сначала её сохранение через общий механизм, затем
 * исполнение по SHA-256 подтверждённого исходника. Конфликт — диалог выбора версии, без запуска.
 * @param cellId ячейка
 */
export async function runCell(cellId: string): Promise<void> {
    if (!canExecute(get()) || conflictFirst()) return;
    const cell = useNotebookStore.getState().confirmed?.cells.find((c) => c.id === cellId);
    if (cell?.kind !== 'code') return;
    const source = await saved([cellId]);
    if (!source) return;
    const text = source.get(cellId)!;
    await send({
        kind: 'execute',
        body: {
            execution_id: crypto.randomUUID(),
            cell_id: cellId,
            source_hash: await sha256(text),
        },
    });
}

/**
 * «Выполнить всё»: кодовые ячейки фиксируются при нажатии — ID, порядок и исходники. Позже
 * добавленные не входят; изменение зафиксированных за время сохранения требует нового нажатия.
 */
export async function runAll(): Promise<void> {
    if (!canExecute(get()) || conflictFirst()) return;
    const { confirmed, drafts } = useNotebookStore.getState();
    const fixed = (confirmed?.cells ?? [])
        .filter((c) => c.kind === 'code')
        .map((c) => ({ id: c.id, text: drafts[c.id] ?? c.source }));
    if (fixed.length === 0) return;
    const sources = await saved(fixed.map((c) => c.id));
    if (!sources) return;
    const order = (useNotebookStore.getState().confirmed?.cells ?? [])
        .filter((c) => sources.has(c.id))
        .map((c) => c.id);
    const same =
        order.join() === fixed.map((c) => c.id).join() &&
        fixed.every((c) => sources.get(c.id) === c.text);
    if (!same) return set({ busy: null });
    const cells = await Promise.all(
        fixed.map(async (c) => ({ cell_id: c.id, source_hash: await sha256(c.text) })),
    );
    await send({ kind: 'executeAll', body: { request_id: crypto.randomUUID(), cells } });
}

/** Повтор команды, чей результат неизвестен после сбоя: те же ID и тело, без нового запуска. */
export async function retryCommand(): Promise<void> {
    if (unsent) return send(unsent);
    if (stopUnsure) return stopRuntime();
    if (startRequest) return startRuntime();
}

// Известный конфликт сохранения: запуск ячейки и «Выполнить всё» открывают диалог, команда не уходит
function conflictFirst(): boolean {
    if (useNotebookStore.getState().conflict.phase === 'none') return false;
    openConflictDialog();
    return true;
}

// Ожидание сохранения ячеек перед исполнением; их подтверждённые исходники или null — не запускать
async function saved(cellIds: string[]): Promise<Map<string, string> | null> {
    const started = generation;
    set({ busy: 'execute', error: null });
    const result = await flush(cellIds);
    if (started !== generation) return null;
    if (!result.ok) {
        set({ busy: null });
        if (result.reason === 'too_large') fail('too_large');
        return null;
    }
    const { confirmed, drafts } = useNotebookStore.getState();
    const sources = new Map<string, string>();
    for (const id of cellIds) {
        const cell = confirmed?.cells.find((c) => c.id === id);
        // ячейку удалили или успели снова изменить: прежнюю версию молча не запускаем
        if (!cell || drafts[id] !== undefined) {
            set({ busy: null });
            return null;
        }
        sources.set(id, cell.source);
    }
    return sources;
}

async function send(command: Command): Promise<void> {
    const session = own();
    if (!session) return set({ busy: null });
    const started = generation;
    set({ busy: 'execute', error: null });
    try {
        const ids =
            command.kind === 'execute'
                ? [
                      (
                          await trpc.runtime.execute.mutate({
                              sessionId: session.id,
                              ...command.body,
                          })
                      ).execution_id,
                  ]
                : (
                      await trpc.runtime.executeAll.mutate({
                          sessionId: session.id,
                          ...command.body,
                      })
                  ).execution_ids;
        if (started !== generation) return;
        unsent = null;
        set({ awaitingRetry: false });
        const cells =
            command.kind === 'execute'
                ? [command.body.cell_id]
                : command.body.cells.map((c) => c.cell_id);
        track(ids.map((execution_id, i) => ({ execution_id, cell_id: cells[i]! })));
        clearTimeout(successTimer);
        set({ busy: null, run: ids, outcome: 'running' });
        kick();
    } catch (error) {
        if (started !== generation) return;
        set({ busy: null });
        unsent = uncertain(error) ? command : null;
        set({ awaitingRetry: unsent !== null });
        const reason = errorOf(error);
        fail(reason);
        // исходник на сервере другой: свежий снимок или выбор версии; код без нового нажатия не идёт
        if (reason === 'conflict') void recheck();
    }
}

/** «Завершить окружение»: после принятия — STOPPING, исполнение недоступно, опрос дочитывает хвост. */
export async function stopRuntime(): Promise<void> {
    const session = own();
    if (!session || ENDED.has(session.state) || get().busy !== null) return;
    const started = generation;
    set({ busy: 'stop', error: null });
    try {
        await trpc.runtime.stop.mutate({ sessionId: session.id });
        if (started !== generation) return;
        stopUnsure = false;
        set({ busy: null, session: { ...get().session!, state: 'STOPPING', stage: 'stopping' } });
        kick();
    } catch (error) {
        if (started !== generation) return;
        set({ busy: null });
        stopUnsure = uncertain(error);
        fail(errorOf(error));
    }
}

// Активность — только реальный ввод в редакторе, не чаще раза в 30 секунд, своей живой сессии
onEdit(() => {
    const session = own();
    if (session?.state !== 'READY' && session?.state !== 'RECONNECTING') return;
    const now = Date.now();
    if (now - lastActivity < ACTIVITY_INTERVAL_MS) return;
    lastActivity = now;
    trpc.runtime.activity.mutate({ sessionId: session.id }).catch(() => {});
});
