import type { SaveStatusTone } from '@components/SaveStatus/SaveStatus';
import type { SaveStatus } from '@stores/notebook';
import {
    canExecute,
    resultsPending,
    runStatus,
    sessionActive,
    type RunOutcome,
    type RuntimeExecution,
    type useRuntimeStore,
} from '@stores/runtime';

type Runtime = ReturnType<typeof useRuntimeStore.getState>;

/** Подпись статуса в шапке: вид и текст. */
export type Label = { tone: SaveStatusTone; text: string };

// Безопасный код причины завершения по простою (backend#13)
const IDLE_REASON = 'idle_timeout';
// все слоты окружений заняты (RUNTIME_MAX_ACTIVE): временно, запуск можно повторить
const CAPACITY_REASON = 'capacity_exceeded';

const own = (runtime: Runtime) =>
    runtime.session?.notebook_id === runtime.notebookId ? runtime.session : null;

const RUN: Record<RunOutcome, Label> = {
    running: { tone: 'progress', text: 'Выполняется' },
    succeeded: { tone: 'success', text: 'Выполнено' },
    failed: { tone: 'error', text: 'Ошибка выполнения' },
    unknown: { tone: 'warning', text: 'Результат неизвестен' },
    stopped: { tone: 'neutral', text: 'Выполнение остановлено' },
};

/**
 * Статус окружения и запуска в шапке: подготовка, связь и завершение окружения, затем запуск.
 * @param runtime состояние стора окружения
 * @returns подпись или undefined — статуса выполнения нет
 */
export function runtimeStatus(runtime: Runtime): Label | undefined {
    const session = own(runtime);
    const state = session?.state;
    if (state === 'PROVISIONING' || state === 'STARTING') {
        return { tone: 'progress', text: 'Подготавливаем окружение…' };
    }
    if (state === 'RECONNECTING') {
        return { tone: 'progress', text: 'Восстанавливаем связь с окружением…' };
    }
    // ошибку очистки показывает баннер: «Завершаем…» её не прикрывает
    if (state === 'STOPPING' && !session?.cleanup_error) {
        return { tone: 'progress', text: 'Завершаем окружение…' };
    }
    const run = runStatus(runtime);
    return run ? RUN[run] : undefined;
}

const SAVE: Partial<Record<SaveStatus, Label>> = {
    dirty: { tone: 'error', text: 'Изменения не сохранены' },
    saving: { tone: 'progress', text: 'Сохраняем…' },
    saved: { tone: 'success', text: 'Сохранено' },
    error: { tone: 'error', text: 'Не удалось сохранить изменения' },
    conflict: { tone: 'error', text: 'Конфликт сохранения: файл изменён в другой вкладке' },
};

// Результат последнего исполнения ячейки не записан: её исходник изменился или её удалили
const resultsConflict = (runtime: Runtime): boolean =>
    Object.values(runtime.executions).some(
        (e) => e.projection === 'conflict' && runtime.latest[e.cell_id] === e.execution_id,
    );

/**
 * Статус сохранения в шапке — рядом со статусом выполнения, не вместо него. Сначала исходники, затем
 * результаты. «Сохранено» не показывается, пока в шапке статус выполнения.
 * @param status статус сохранения исходников
 * @param runtime состояние стора окружения
 * @returns подпись или undefined
 */
export function saveStatus(status: SaveStatus, runtime: Runtime): Label | undefined {
    if (status !== 'idle' && status !== 'saved') return SAVE[status];
    if (resultsConflict(runtime)) return { tone: 'error', text: 'Не удалось сохранить результаты' };
    if (resultsPending(runtime)) return { tone: 'progress', text: 'Сохраняем результаты…' };
    if (status === 'saved' && !runtimeStatus(runtime)) return SAVE.saved;
    return undefined;
}

/** Какой баннер окружения показать над ячейками. */
export type BannerKind =
    | 'linkLost'
    | 'busy'
    | 'cleanup'
    | 'capacityExceeded'
    | 'startFailed'
    | 'idle'
    | 'notStarted';

/**
 * Баннер окружения: нет связи, занято другим блокнотом, ошибка очистки, все окружения заняты, ошибка
 * запуска, завершено по
 * простою, не запущено. Живая своя сессия без проблем — без баннера: её видно по статусу в шапке.
 * @param runtime состояние стора окружения
 * @returns вид баннера или null
 */
export function bannerKind(runtime: Runtime): BannerKind | null {
    const session = own(runtime);
    if (runtime.linkLost) return 'linkLost';
    if (!session && sessionActive(runtime.session)) return 'busy';
    // слот занят, пока очистка не подтверждена; после STOPPED слот свободен — это не ошибка
    if (sessionActive(session) && session?.cleanup_error) return 'cleanup';
    // ошибка нового запуска важнее причины прежней FAILED-сессии в сторе
    if (runtime.startFailed) return 'startFailed';
    if (session?.state === 'FAILED') {
        return session.reason === CAPACITY_REASON ? 'capacityExceeded' : 'startFailed';
    }
    if (session?.state === 'STOPPED' && session.reason === IDLE_REASON) return 'idle';
    if (sessionActive(session)) return null;
    return 'notStarted';
}

/** Кнопки окружения в панели шапки. */
export interface RuntimeButtons {
    /** «Завершить окружение» видна */
    stop: boolean;
    /** «Запустить всё»: скрыта, пока идёт запуск, иначе доступна или нет */
    runAll: 'hidden' | 'enabled' | 'disabled';
}

/**
 * Кнопки окружения: завершить — у готовой своей сессии, «Запустить всё» — вне очереди исполнения.
 * @param runtime состояние стора окружения
 * @param hasCode в блокноте есть кодовые ячейки
 * @returns видимость и доступность кнопок
 */
export function runtimeButtons(runtime: Runtime, hasCode: boolean): RuntimeButtons {
    const state = own(runtime)?.state;
    const stop = state === 'READY' || state === 'RECONNECTING';
    if (stop && runtime.queue.length > 0) return { stop, runAll: 'hidden' };
    return { stop, runAll: hasCode && canExecute(runtime) ? 'enabled' : 'disabled' };
}

const FAILED = new Set<RuntimeExecution['state']>(['FAILED', 'TIMED_OUT', 'REJECTED']);

const MESSAGE: Partial<Record<RuntimeExecution['state'], string>> = {
    TIMED_OUT: 'Превышено время выполнения',
    CANCELLED: 'Выполнение отменено',
    INTERRUPTED: 'Выполнение прервано',
    UNKNOWN: 'Результат неизвестен — код мог выполниться, повторно не запускаем',
    REJECTED: 'Окружение отклонило выполнение',
};

/** Исполнение у кодовой ячейки: что показать в левой колонке и под кодом. */
export interface CellRun {
    /** Кнопка запуска, «Выполняется» или «В очереди» */
    indicator: 'run' | 'running' | 'queued';
    /** Значок итога под счётчиком */
    result: 'succeeded' | 'failed' | 'unknown' | null;
    /** Строка состояния под кодом */
    message: string | null;
    /** Показывать выводы: в очереди прежние уже не относятся к запуску */
    outputs: boolean;
    /** Начало выполнения, мс: для таймера «Выполняется… N с» */
    since?: number;
}

/**
 * Исполнение у ячейки: из очереди своей сессии, затем из последнего исполнения на этой странице,
 * затем из сохранённого результата. Сохранённый результат без ошибки — галочка под счётчиком.
 * @param runtime состояние стора окружения
 * @param cell id, счётчик и выводы ячейки
 * @param cell.id id ячейки
 * @param cell.executionCount сохранённый счётчик Jupyter
 * @param cell.outputs сохранённые выводы
 * @returns состояние для отображения
 */
export function cellRun(
    runtime: Runtime,
    cell: { id: string; executionCount: number | null; outputs: { output_type?: unknown }[] },
): CellRun {
    const queued = own(runtime)
        ? runtime.queue.find((item) => item.cell_id === cell.id)
        : undefined;
    const execution = runtime.executions[runtime.latest[cell.id] ?? ''];
    if (queued?.state === 'RUNNING') {
        return {
            indicator: 'running',
            result: null,
            message: 'Выполняется…',
            // вывод текущей попытки, а не прежний
            outputs: execution?.execution_id === queued.execution_id,
            since: runtime.startedAt[queued.execution_id],
        };
    }
    // в очереди — только индикатор слева, без строки состояния под кодом
    if (queued) return { indicator: 'queued', result: null, message: null, outputs: false };
    if (execution && execution.state !== 'QUEUED' && execution.state !== 'RUNNING') {
        return {
            indicator: 'run',
            result:
                execution.state === 'SUCCEEDED'
                    ? 'succeeded'
                    : FAILED.has(execution.state)
                      ? 'failed'
                      : execution.state === 'UNKNOWN'
                        ? 'unknown'
                        : null,
            message: MESSAGE[execution.state] ?? null,
            outputs: true,
        };
    }
    const error = cell.outputs.some((output) => output.output_type === 'error');
    return {
        indicator: 'run',
        result: error ? 'failed' : cell.executionCount === null ? null : 'succeeded',
        message: null,
        outputs: true,
    };
}
