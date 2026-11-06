import { clsx } from '@cdd-team/clsx';
import { useNavigate } from '@cdd-team/router';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import type { SaveStatusTone } from '@components/SaveStatus/SaveStatus';
import {
    canExecute,
    resultsPending,
    runAll,
    runCell,
    runStatus,
    sessionActive,
    startRuntime,
    stopRuntime,
    useRuntimeStore,
    type RunOutcome,
} from '@stores/runtime';
import styles from './Runtime.module.css';

type Runtime = ReturnType<typeof useRuntimeStore.getState>;

// Безопасный код причины завершения по простою (backend#13)
const IDLE_REASON = 'idle_timeout';

const own = (runtime: Runtime) =>
    runtime.session?.notebook_id === runtime.notebookId ? runtime.session : null;

const RUN: Record<RunOutcome, { tone: SaveStatusTone; text: string }> = {
    running: { tone: 'progress', text: 'Выполняется' },
    queued: { tone: 'progress', text: 'В очереди' },
    succeeded: { tone: 'success', text: 'Выполнено' },
    failed: { tone: 'error', text: 'Ошибка выполнения' },
    unknown: { tone: 'error', text: 'Результат неизвестен' },
    stopped: { tone: 'error', text: 'Выполнение остановлено' },
};

/**
 * Статус окружения и запуска для шапки: подготовка и завершение окружения, затем запуск, затем
 * сохранение результатов. Сохранение исходников показывается рядом, отдельно.
 * @param runtime состояние стора окружения
 * @returns подпись или undefined — статуса нет
 */
export function runtimeStatus(
    runtime: Runtime,
): { tone: SaveStatusTone; text: string } | undefined {
    const session = own(runtime);
    if (session?.state === 'PROVISIONING' || session?.state === 'STARTING') {
        return { tone: 'progress', text: 'Подготавливаем окружение…' };
    }
    if (session?.state === 'RECONNECTING') {
        return { tone: 'progress', text: 'Восстанавливаем связь с окружением…' };
    }
    if (session?.state === 'STOPPING') return { tone: 'progress', text: 'Завершаем окружение…' };
    const run = runStatus(runtime);
    if (run) return RUN[run];
    if (resultsPending(runtime)) return { tone: 'progress', text: 'Сохраняем результаты…' };
    return undefined;
}

/**
 * Ячейка, которая выполняется сейчас: для «Перейти к ячейке».
 * @param runtime состояние стора окружения
 * @returns id ячейки или undefined
 */
export function runningCell(runtime: Runtime): string | undefined {
    return runtime.queue.find((item) => item.state === 'RUNNING')?.cell_id;
}

/** Свойства {@link RuntimeActions}. */
interface RuntimeActionsProps {
    /** В блокноте есть кодовые ячейки */
    hasCode: boolean;
}

/**
 * «Завершить окружение» и «Запустить всё» справа в панели шапки.
 * @param props свойства кнопок
 * @returns кнопки
 */
export function RuntimeActions({ hasCode }: RuntimeActionsProps) {
    const runtime = useRuntimeStore();
    const session = own(runtime);
    const live = sessionActive(session) && session?.state !== 'STOPPING';
    return (
        <div className={styles.actions}>
            {live && (
                <Button
                    key="stop"
                    variant="danger"
                    icon="stop"
                    className={styles.button}
                    loading={runtime.busy === 'stop'}
                    onClick={() => void stopRuntime()}
                >
                    Завершить окружение
                </Button>
            )}
            <Button
                key="run-all"
                icon="play"
                className={styles.button}
                loading={runtime.busy === 'execute'}
                disabled={!hasCode || !canExecute(runtime)}
                onClick={() => void runAll()}
            >
                Запустить всё
            </Button>
        </div>
    );
}

type Banner = {
    icon: 'alert' | 'info' | 'play';
    title: string;
    text: string;
    action?: { label: string; onClick: () => void; loading?: boolean };
    tone?: 'error';
};

const banner = (runtime: Runtime, openNotebook: (id: number) => void): Banner | null => {
    const session = own(runtime);
    const starting = runtime.busy === 'start';
    const start = {
        label: 'Запустить окружение',
        onClick: () => void startRuntime(),
        loading: starting,
    };
    if (runtime.linkLost) {
        return {
            icon: 'alert',
            tone: 'error',
            title: 'Не удаётся получить обновления',
            text: 'Показываем последнее известное состояние. Код на сервере может выполняться — после восстановления связи повторно его не запускаем.',
        };
    }
    if (runtime.session && !session && sessionActive(runtime.session)) {
        const id = runtime.session.notebook_id;
        return {
            icon: 'info',
            title: 'Окружение занято другим блокнотом',
            text: 'Код выполняется в другом блокноте. Завершите там окружение, чтобы запустить его здесь.',
            action: { label: 'Перейти к блокноту', onClick: () => openNotebook(id) },
        };
    }
    if (session?.cleanup_error) {
        return {
            icon: 'alert',
            tone: 'error',
            title: 'Не удалось завершить очистку окружения',
            text: 'Новый запуск станет доступен, когда очистка завершится.',
            action: {
                label: 'Повторить завершение',
                onClick: () => void stopRuntime(),
                loading: runtime.busy === 'stop',
            },
        };
    }
    if (runtime.startFailed || session?.state === 'FAILED') {
        return {
            icon: 'alert',
            tone: 'error',
            title: 'Не удалось запустить окружение',
            text: 'Сохранённые ячейки и результаты доступны, правки сохраняются.',
            action: { ...start, label: 'Повторить запуск' },
        };
    }
    if (session?.state === 'STOPPED' && session.reason === IDLE_REASON) {
        return {
            icon: 'info',
            title: 'Окружение завершено после 15 минут бездействия',
            text: 'Сохранённые результаты доступны. Переменные в памяти сброшены.',
            action: start,
        };
    }
    if (sessionActive(session)) return null;
    return {
        icon: 'play',
        title: 'Окружение не запущено',
        text: 'Сохранённые ячейки и результаты доступны. Без действий окружение завершится через 15 минут.',
        action: start,
    };
};

/** Свойства {@link RuntimeBanner}. */
interface RuntimeBannerProps {
    className?: string;
}

/**
 * Состояние окружения над ячейками: не запущено, занято другим блокнотом, ошибка запуска или
 * очистки, завершено по простою, нет связи.
 * @param props свойства баннера
 * @returns баннер или ничего
 */
export function RuntimeBanner({ className }: RuntimeBannerProps) {
    const runtime = useRuntimeStore();
    const navigate = useNavigate();
    const shown = banner(runtime, (id) =>
        navigate({ to: '/notebooks/$notebookId', params: { notebookId: String(id) } }),
    );
    if (!shown) return null;
    return (
        <div
            className={clsx(styles.banner, shown.tone === 'error' && styles.error, className)}
            role={shown.tone === 'error' ? 'alert' : 'status'}
        >
            <Icon key="icon" name={shown.icon} className={styles.icon} />
            <div key="text" className={styles.text}>
                <p key="title" className={styles.title}>
                    {shown.title}
                </p>
                <p key="body" className={styles.body}>
                    {shown.text}
                </p>
            </div>
            {shown.action && (
                <Button
                    key="action"
                    variant={shown.action.label === 'Перейти к блокноту' ? 'secondary' : 'primary'}
                    className={styles.button}
                    loading={shown.action.loading}
                    onClick={shown.action.onClick}
                >
                    {shown.action.label}
                </Button>
            )}
        </div>
    );
}

/** Свойства {@link RunGutter}. */
interface RunGutterProps {
    cellId: string;
    /** Сохранённый счётчик Jupyter */
    executionCount: number | null;
}

/**
 * Левая колонка кодовой ячейки: ▶, спиннер в очереди и `[execution_count]`.
 * @param props ячейка и её счётчик
 * @returns колонка
 */
export function RunGutter({ cellId, executionCount }: RunGutterProps) {
    const runtime = useRuntimeStore();
    const queued = runtime.queue.find((item) => item.cell_id === cellId)?.state;
    const execution = runtime.executions[runtime.latest[cellId] ?? ''];
    const failed =
        !queued &&
        execution !== undefined &&
        !['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(execution.state);
    return (
        <>
            {queued === 'RUNNING' ? (
                <span key="running" className={clsx(styles.indicator, styles.running)}>
                    <Icon key="icon" name="spinner" className={styles.spin} />
                    <span key="label" className={styles.srOnly}>
                        Выполняется
                    </span>
                </span>
            ) : queued === 'QUEUED' ? (
                <span key="queued" className={clsx(styles.indicator, styles.queued)}>
                    <Icon key="icon" name="dot" size={8} />
                    <span key="label" className={styles.srOnly}>
                        В очереди
                    </span>
                </span>
            ) : (
                <button
                    key="run"
                    type="button"
                    className={styles.run}
                    aria-label="Выполнить ячейку"
                    disabled={!canExecute(runtime)}
                    onClick={() => void runCell(cellId)}
                >
                    <Icon name="play" size={12} />
                </button>
            )}
            <span key="count" className={styles.count}>
                {queued === 'RUNNING' ? '[*]' : queued ? '[ ]' : `[${executionCount ?? ' '}]`}
            </span>
            {!queued && execution?.state === 'SUCCEEDED' && (
                <Icon key="done" name="check" className={styles.done} />
            )}
            {failed && <Icon key="failed" name="alert" className={styles.failed} />}
        </>
    );
}

const EXECUTION: Partial<Record<string, string>> = {
    TIMED_OUT: 'Превышено время выполнения',
    CANCELLED: 'Выполнение отменено',
    INTERRUPTED: 'Выполнение прервано',
    UNKNOWN: 'Результат неизвестен — код мог выполниться, повторно не запускаем',
    REJECTED: 'Окружение отклонило выполнение',
};

/**
 * Состояние исполнения под кодом: выполняется, в очереди или итог без вывода об ошибке.
 * @param props ячейка
 * @returns строка состояния или ничего
 */
export function RunState({ cellId }: { cellId: string }) {
    const runtime = useRuntimeStore();
    const queued = runtime.queue.find((item) => item.cell_id === cellId)?.state;
    const execution = runtime.executions[runtime.latest[cellId] ?? ''];
    if (queued === 'RUNNING') {
        return (
            <p className={styles.state}>
                <Icon key="icon" name="spinner" className={styles.spin} />
                Выполняется…
            </p>
        );
    }
    if (queued === 'QUEUED') {
        return (
            <p className={styles.state}>
                <Icon key="icon" name="dot" size={8} />В очереди
            </p>
        );
    }
    const text = execution && EXECUTION[execution.state];
    if (!text) return null;
    return (
        <p className={clsx(styles.state, styles.stateError)}>
            <Icon key="icon" name="alert" />
            {text}
        </p>
    );
}
