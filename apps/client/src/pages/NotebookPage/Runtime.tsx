import { useEffect, useState } from '@cdd-team/react';
import { clsx } from '@cdd-team/clsx';
import { useNavigate } from '@cdd-team/router';
import { Button } from '@components/Button/Button';
import { Icon, type IconName } from '@components/Icon/Icon';
import {
    canExecute,
    interruptCell,
    runAll,
    runCell,
    startRuntime,
    stopExecutions,
    stopRuntime,
    useRuntimeStore,
} from '@stores/runtime';
import { SEARCH_BUTTON_ID, SEARCH_PANEL_ID } from './search';
import { bannerKind, runtimeButtons, type BannerKind, type CellRun } from './status';
import styles from './Runtime.module.css';

type Runtime = ReturnType<typeof useRuntimeStore.getState>;

/** Свойства {@link RuntimeActions}. */
interface RuntimeActionsProps {
    /** В блокноте есть кодовые ячейки */
    hasCode: boolean;
    /** «К выполняемой ячейке»: прокрутить к ячейке, которая выполняется сейчас */
    onJump: (cellId: string) => void;
    /** Кнопка «Поиск»: нет — кнопки нет (тач) */
    search?: {
        /** Панель поиска открыта */
        open: boolean;
        onOpen: () => void;
    };
}

/**
 * Справа в панели шапки: «К выполняемой ячейке», на одном месте «Запустить всё» или «Остановить
 * всё», затем «Поиск».
 */
export function RuntimeActions({ hasCode, onJump, search }: RuntimeActionsProps) {
    const runtime = useRuntimeStore();
    const { main, canRunAll, running } = runtimeButtons(runtime, hasCode);
    const stopping = runtime.busy === 'stopAll';
    return (
        <div className={styles.actions}>
            {running && (
                <Button
                    key="jump"
                    variant="secondary"
                    icon="target"
                    className={clsx(styles.button, styles.jump)}
                    onClick={() => {
                        // по актуальному состоянию на момент нажатия, а не на момент отрисовки
                        const now = runtimeButtons(useRuntimeStore.getState(), hasCode).running;
                        if (now) onJump(now);
                    }}
                >
                    К выполняемой ячейке
                </Button>
            )}
            {main === 'stop' ? (
                <Button
                    key="stop-all"
                    variant="danger"
                    icon="stop"
                    className={clsx(styles.button, styles.main)}
                    loading={stopping}
                    disabled={stopping}
                    onClick={() => void stopExecutions()}
                >
                    {stopping ? 'Останавливаем…' : 'Остановить всё'}
                </Button>
            ) : (
                <Button
                    key="run-all"
                    icon="play"
                    className={clsx(styles.button, styles.main)}
                    loading={runtime.busy === 'execute'}
                    disabled={!canRunAll}
                    onClick={() => void runAll()}
                >
                    Запустить всё
                </Button>
            )}
            {search && (
                <Button
                    key="search"
                    id={SEARCH_BUTTON_ID}
                    variant="secondary"
                    icon="search"
                    className={styles.button}
                    expanded={search.open}
                    controls={search.open ? SEARCH_PANEL_ID : undefined}
                    onClick={search.onOpen}
                >
                    Поиск
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
    capacityExceeded: {
        icon: 'alert',
        tone: 'muted',
        title: 'Все окружения сейчас заняты',
        text: 'Запустите окружение ещё раз через несколько минут. Сохранённые ячейки и результаты доступны.',
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

/** Действие баннера: у «нет связи» его нет, запуск окружения — главное действие. */
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
        case 'capacityExceeded':
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
 * Левая колонка кодовой ячейки: кнопка запуска или индикатор очереди, `[execution_count]` и
 * значок итога.
 */
export function RunGutter({ cellId, executionCount, run }: RunGutterProps) {
    const runtime = useRuntimeStore();
    return (
        <>
            {run.indicator === 'running' ? (
                <button
                    key="interrupt"
                    type="button"
                    className={clsx(styles.run, styles.running)}
                    aria-label="Остановить ячейку"
                    title="Остановить ячейку"
                    disabled={run.interrupting}
                    onClick={() => void interruptCell(cellId)}
                >
                    <Icon
                        name={run.interrupting ? 'spinner' : 'stop'}
                        size={14}
                        className={clsx(run.interrupting && styles.spin)}
                    />
                </button>
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
            {run.result === 'interrupted' && <Icon key="interrupted" name="square" />}
        </>
    );
}

/**
 * Строка состояния исполнения под кодом: выполняется, в очереди или итог без вывода об ошибке.
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
                          : (STATE_ICON[run.result ?? 'failed'] ?? 'alert')
                }
                className={clsx(run.indicator === 'running' && styles.spin)}
            />
            {run.since === undefined ? (
                run.message
            ) : (
                <Elapsed
                    prefix={run.interrupting ? 'Останавливаем…' : 'Выполняется…'}
                    since={run.since}
                />
            )}
        </p>
    );
}

const STATE_ICON: Partial<Record<NonNullable<CellRun['result']>, IconName>> = {
    unknown: 'help',
    interrupted: 'square',
    cancelled: 'ban',
};

/**
 * Секунды с `since`, обновляются раз в секунду.
 * @param since начало отсчёта, мс; без него — undefined
 */
export function useElapsed(since: number | undefined): number | undefined {
    const [now, setNow] = useState(since ?? 0);
    useEffect(() => {
        if (since === undefined) return;
        const tick = () => setNow(Date.now());
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [since]);
    return since === undefined ? undefined : Math.max(0, Math.floor((now - since) / 1000));
}

/** «Выполняется… N с» или «Останавливаем… N с» у ячейки. */
function Elapsed({ prefix, since }: { prefix: string; since: number }) {
    return <>{`${prefix} ${useElapsed(since)} с`}</>;
}
