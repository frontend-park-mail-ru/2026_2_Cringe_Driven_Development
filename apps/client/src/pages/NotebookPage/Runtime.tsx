import { clsx } from '@cdd-team/clsx';
import { useNavigate } from '@cdd-team/router';
import { Button } from '@components/Button/Button';
import { Icon, type IconName } from '@components/Icon/Icon';
import {
    canExecute,
    runAll,
    runCell,
    startRuntime,
    stopRuntime,
    useRuntimeStore,
} from '@stores/runtime';
import { bannerKind, runtimeButtons, type BannerKind, type CellRun } from './status';
import styles from './Runtime.module.css';

type Runtime = ReturnType<typeof useRuntimeStore.getState>;

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
    const { stop, runAll: all } = runtimeButtons(runtime, hasCode);
    return (
        <div className={styles.actions}>
            {stop && (
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
            {all !== 'hidden' && (
                <Button
                    key="run-all"
                    icon="play"
                    className={styles.button}
                    loading={runtime.busy === 'execute'}
                    disabled={all === 'disabled'}
                    onClick={() => void runAll()}
                >
                    Запустить всё
                </Button>
            )}
        </div>
    );
}

const BANNER: Record<
    BannerKind,
    { icon: IconName; title: string; text: string; tone?: 'error' | 'muted' }
> = {
    linkLost: {
        icon: 'alert',
        tone: 'muted',
        title: 'Не удаётся получить обновления',
        text: 'Показываем последнее известное состояние. Код на сервере может выполняться — после восстановления связи повторно его не запускаем.',
    },
    busy: {
        icon: 'file',
        title: 'Окружение занято другим блокнотом',
        text: 'Код выполняется в другом блокноте. Завершите там окружение, чтобы запустить его здесь.',
    },
    cleanup: {
        icon: 'alert',
        tone: 'error',
        title: 'Не удалось завершить очистку окружения',
        text: 'Новый запуск станет доступен, когда очистка завершится.',
    },
    startFailed: {
        icon: 'alert',
        tone: 'error',
        title: 'Не удалось запустить окружение',
        text: 'Сохранённые ячейки и результаты доступны, правки сохраняются.',
    },
    idle: {
        icon: 'dot',
        title: 'Окружение завершено после 15 минут бездействия',
        text: 'Сохранённые результаты доступны. Переменные в памяти сброшены.',
    },
    notStarted: {
        icon: 'play',
        title: 'Окружение не запущено',
        text: 'Сохранённые ячейки и результаты доступны.',
    },
};

type BannerAction = { label: string; onClick: () => void; loading?: boolean; primary?: true };

// Действие баннера: у «нет связи» его нет, запуск окружения — главное действие
function bannerAction(
    kind: BannerKind,
    runtime: Runtime,
    openNotebook: (notebookId: number) => void,
): BannerAction | undefined {
    const starting = runtime.busy === 'start';
    switch (kind) {
        case 'busy': {
            const notebookId = runtime.session!.notebook_id;
            return { label: 'Перейти к блокноту', onClick: () => openNotebook(notebookId) };
        }
        case 'cleanup':
            return {
                label: 'Повторить завершение',
                onClick: () => void stopRuntime(),
                loading: runtime.busy === 'stop',
            };
        case 'startFailed':
            return {
                label: 'Повторить запуск',
                onClick: () => void startRuntime(),
                loading: starting,
            };
        case 'idle':
        case 'notStarted':
            return {
                label: 'Запустить окружение',
                onClick: () => void startRuntime(),
                loading: starting,
                primary: true,
            };
        case 'linkLost':
            return undefined;
    }
}

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
    const kind = bannerKind(runtime);
    if (!kind) return null;
    const shown = BANNER[kind];
    const action = bannerAction(kind, runtime, (notebookId) =>
        navigate({ to: '/notebooks/$notebookId', params: { notebookId: String(notebookId) } }),
    );
    return (
        <div
            className={clsx(styles.banner, shown.tone && styles[shown.tone], className)}
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
            {action && (
                <Button
                    key="action"
                    variant={action.primary ? 'primary' : 'secondary'}
                    className={styles.button}
                    loading={action.loading}
                    onClick={action.onClick}
                >
                    {action.label}
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
    run: CellRun;
}

/**
 * Левая колонка кодовой ячейки: кнопка запуска или индикатор очереди, `[execution_count]` и значок итога.
 * @param props ячейка, её счётчик и исполнение
 * @returns колонка
 */
export function RunGutter({ cellId, executionCount, run }: RunGutterProps) {
    const runtime = useRuntimeStore();
    return (
        <>
            {run.indicator === 'running' ? (
                <span key="running" className={clsx(styles.indicator, styles.running)}>
                    <Icon key="icon" name="orbit" size={24} className={styles.spin} />
                    <span key="label" className={styles.srOnly}>
                        Выполняется
                    </span>
                </span>
            ) : run.indicator === 'queued' ? (
                <span key="queued" className={clsx(styles.indicator, styles.queued)}>
                    <Icon key="icon" name="dot" size={14} />
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
                    <Icon name="play" size={14} />
                </button>
            )}
            <span key="count" className={styles.count}>
                {run.indicator === 'running'
                    ? '[*]'
                    : run.indicator === 'queued'
                      ? '[ ]'
                      : `[${executionCount ?? ' '}]`}
            </span>
            {run.result === 'succeeded' && <Icon key="done" name="check" className={styles.done} />}
            {run.result === 'failed' && (
                <Icon key="failed" name="alert" className={styles.failed} />
            )}
            {run.result === 'unknown' && (
                <Icon key="unknown" name="help" className={styles.unknown} />
            )}
        </>
    );
}

/**
 * Строка состояния исполнения под кодом: выполняется, в очереди или итог без вывода об ошибке.
 * @param props исполнение ячейки
 * @param props.run исполнение ячейки
 * @returns строка состояния или ничего
 */
export function RunState({ run }: { run: CellRun }) {
    if (!run.message) return null;
    const progress = run.indicator !== 'run';
    return (
        <p
            className={clsx(
                styles.state,
                run.result === 'failed' && styles.failed,
                run.result === 'unknown' && styles.unknown,
            )}
        >
            <Icon
                key="icon"
                name={
                    run.indicator === 'running'
                        ? 'orbit'
                        : progress
                          ? 'dot'
                          : run.result === 'unknown'
                            ? 'help'
                            : 'alert'
                }
                className={clsx(run.indicator === 'running' && styles.spin)}
            />
            {run.message}
        </p>
    );
}
