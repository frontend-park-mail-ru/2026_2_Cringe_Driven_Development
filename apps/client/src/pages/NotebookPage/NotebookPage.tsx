import { useEffect, useLayoutEffect, useState } from '@cdd-team/react';

import { isRpcError, trpc, type Cell as CellData, type NotebookPageData } from '@api/trpc';
import LogoMark from '@assets/logo-mark.svg?react';
import { Cell, CellSkeleton, cellEditorId } from '@components/Cell/Cell';
import { Chip } from '@components/Chip/Chip';
import { Header } from '@components/Header/Header';
import { IconButton } from '@components/IconButton/IconButton';
import { ProfileLink } from '@components/ProfileLink/ProfileLink';
import { ScrollTop } from '@components/ScrollTop/ScrollTop';
import { SaveStatus } from '@components/SaveStatus/SaveStatus';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { clsx } from '@cdd-team/clsx';
import { useNavigate, useParams } from '@cdd-team/router';
import {
    addCell,
    leaveNotebook,
    commitSource,
    deleteCell,
    editSource,
    moveCell,
    openNotebook,
    pastedPart,
    retry,
    structureLocked,
    useNotebookStore,
    type Orphan,
} from '@stores/notebook';
import type { CreatableKind } from '@stores/notebook/snapshot';
import { peekPreloadedNotebook, takePreloadedNotebook } from '@stores/preloaded';
import {
    closeRuntime,
    openRuntime,
    retryCommand,
    useRuntimeStore,
    type RuntimeError,
} from '@stores/runtime';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import { plural } from '@utils/plural';
import { useTouchDevice } from '@utils/touch';
import { ConflictBanner, ConflictDialog, OrphanDraft } from './Conflict';
import { Outputs, type NbOutput } from './Output';
import { RunGutter, RunState, RuntimeActions, RuntimeBanner } from './Runtime';
import { cellRun, runtimeStatus, saveStatus, type CellRun } from './status';
import styles from './NotebookPage.module.css';

/** Сколько скелетонов показывать, пока блокнот загружается */
const SKELETON_COUNT = 4;

/**
 * Загружает блокнот.
 * @param id id блокнота
 * @returns данные блокнота, 'missing', если такого блокнота нет, или undefined, если загрузить не удалось
 */
async function loadNotebook(id: number): Promise<NotebookPageData | 'missing' | undefined> {
    if (!Number.isInteger(id)) return 'missing';
    try {
        return await trpc.notebooks.get.query({ id });
    } catch (error) {
        const code = isRpcError(error) ? error.data?.code : undefined;
        return code === 'NOT_FOUND' || code === 'BAD_REQUEST' ? 'missing' : undefined;
    }
}

// «+ Код» в шапке: есть всегда, в том числе в пустом блокноте
const ADD_CODE_ID = 'add-code';

const ERRORS = {
    save: 'Не удалось сохранить изменения',
    too_many_cells: 'В блокноте уже 1000 ячеек — больше добавить нельзя',
    notebook_gone: 'Блокнот недоступен: возможно, его удалили',
};

const RUNTIME_ERRORS: Record<RuntimeError, string> = {
    network: 'Не удалось отправить команду окружению',
    queue_full: 'Очередь исполнения переполнена — повторите позже',
    unavailable: 'Окружение сейчас недоступно',
    conflict: 'Код ячейки изменился — проверьте его и запустите снова',
    too_large: 'Превышен размер ячейки — максимум 64 КиБ',
    failed: 'Не удалось выполнить команду окружения',
};

const PASTE_NOTICE_MS = 4000;

// Лимит — в байтах, но человеку понятнее, сколько символов вошло: «37 090»
const countChars = (text: string): string => [...text].length.toLocaleString('ru-RU');

// Больше лимита не вставляется: такой исходник не сохранить. Помещающаяся часть вставляется как
// обычный ввод — с отменой по Ctrl+Z
const handlePaste = (event: ClipboardEvent): void => {
    const editor = event.target as HTMLTextAreaElement;
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    const part = pastedPart(editor.value, editor.selectionStart, editor.selectionEnd, pasted);
    if (part === pasted) return;
    event.preventDefault();
    if (part) document.execCommand('insertText', false, part);
    const shown = showSnackbar(
        `Вставлено символов: ${countChars(part)} из ${countChars(pasted)} — остальное не помещается в ячейку`,
    );
    // это уведомление, а не ошибка с действием: прячется само
    setTimeout(() => hideSnackbar(shown), PASTE_NOTICE_MS);
};

/** Свойства {@link AddCellChips}. */
interface AddCellChipsProps {
    /** id чипа «+ Код»: у чипов в шапке */
    codeId?: string;
    disabled: boolean;
    onAdd: (kind: CreatableKind) => void;
}

/**
 * Чипы «+ Код» и «+ Текст».
 * @param props свойства чипов
 * @returns чипы
 */
function AddCellChips({ codeId, disabled, onAdd }: AddCellChipsProps) {
    return (
        <>
            <Chip key="code" id={codeId} disabled={disabled} onClick={() => onAdd('code')}>
                Код
            </Chip>
            <Chip key="markdown" disabled={disabled} onClick={() => onAdd('markdown')}>
                Текст
            </Chip>
        </>
    );
}

type CellProps = Parameters<typeof Cell>[0];

// Ячейка с исполнением: у кодовой — кнопка запуска и счётчик слева, состояние и выводы под кодом
function CodeOrText({
    run,
    ...props
}: Omit<CellProps, 'gutter' | 'below' | 'run'> & { run?: CellRun }) {
    const { cell } = props;
    if (cell.kind !== 'code' || !run) return <Cell {...props} />;
    return (
        <Cell
            {...props}
            run={
                run.indicator === 'running'
                    ? 'running'
                    : run.result === 'failed'
                      ? 'failed'
                      : undefined
            }
            gutter={<RunGutter cellId={cell.id} executionCount={cell.execution_count} run={run} />}
            below={
                <>
                    <RunState key="state" run={run} />
                    {run.outputs && (
                        <Outputs
                            key="outputs"
                            outputs={cell.outputs as NbOutput[]}
                            truncated={cell.output_truncated}
                        />
                    )}
                </>
            }
        />
    );
}

// Фокус в редактор ячейки; без ячейки — на первый чип «+ Код»
const focusCell = (id: string | undefined): void => {
    const target = id ? document.getElementById(cellEditorId(id)) : null;
    if (target) {
        target.focus();
        target.closest('li')?.scrollIntoView({ block: 'nearest' });
        return;
    }
    document.getElementById(ADD_CODE_ID)?.focus();
};

/**
 * Страница блокнота: шапка со статусом сохранения и редактируемые ячейки. Всё сохранение — в
 * `@stores/notebook`; страница показывает его состояние и передаёт действия.
 * @returns страница
 */
export function NotebookPage() {
    const navigate = useNavigate();
    const id = Number(useParams({ from: '/_auth/notebooks/$notebookId' }).notebookId);
    // При прямом открытии своего блокнота BFF уже положил его в bootstrap: первый показ без запроса
    const [load, setLoad] = useState<'loading' | 'error' | 'ready'>(
        peekPreloadedNotebook(id) ? 'ready' : 'loading',
    );
    const [attempt, setAttempt] = useState(0);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    // Куда перевести фокус после отрисовки: новая ячейка или соседняя после удаления
    const [focusTarget, setFocusTarget] = useState<{ id: string | undefined } | null>(null);
    // Созданная в этой сессии ячейка: Markdown в ней сразу открывается для ввода
    const [fresh, setFresh] = useState<string | undefined>(undefined);
    // на тач-устройстве блокнот только для чтения: ячейки не создаются, не меняются и не двигаются
    const touch = useTouchDevice();
    const notebook = useNotebookStore();
    const runtime = useRuntimeStore();

    // до первой отрисовки: блокнот из bootstrap открывается в сторе без мигания скелетона
    useLayoutEffect(() => {
        let alive = true;
        const first = takePreloadedNotebook(id);
        if (first) {
            openNotebook(first);
            openRuntime(first);
            setLoad('ready');
            return () => {
                alive = false;
            };
        }
        setLoad('loading');
        void loadNotebook(id).then((page) => {
            if (!alive) return;
            // отсутствующий и чужой блокнот (одинаковый NOT_FOUND) — как прямое открытие: на /404
            if (page === 'missing') {
                void navigate({ to: '/404', replace: true });
                return;
            }
            if (page) {
                openNotebook(page);
                openRuntime(page);
                setLoad('ready');
                return;
            }
            setLoad('error');
            showSnackbar('Не удалось загрузить блокнот', {
                label: 'Повторить',
                onClick: () => setAttempt((current) => current + 1),
            });
        });
        return () => {
            alive = false;
            hideSnackbar();
        };
    }, [id, attempt, navigate]);

    // уход со страницы: несохранённое отправляется сразу, очередь дорабатывает в фоне
    // окружение при уходе не останавливается: прекращается только опрос этой страницы
    useEffect(
        () => () => {
            leaveNotebook();
            closeRuntime();
        },
        [id],
    );
    // стал тачем посреди ввода: редакторы пропадают, черновики отправляются сразу
    useLayoutEffect(() => {
        if (touch) leaveNotebook();
    }, [touch]);

    // Несохранённый текст: браузер предупредит перед уходом и перезагрузкой
    const unsaved = notebook.status !== 'idle' && notebook.status !== 'saved';
    useEffect(() => {
        if (!unsaved) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [unsaved]);

    // failure растёт при каждой ошибке: после неудачного «Повторить» снекбар появляется снова
    useEffect(() => {
        if (!notebook.error) return;
        const shown =
            notebook.error === 'save'
                ? showSnackbar(ERRORS.save, { label: 'Повторить', onClick: () => void retry() })
                : showSnackbar(ERRORS[notebook.error]);
        return () => hideSnackbar(shown);
    }, [notebook.error, notebook.failure]);

    useEffect(() => {
        if (!runtime.error) return;
        const shown =
            runtime.error === 'network'
                ? showSnackbar(RUNTIME_ERRORS.network, {
                      label: 'Повторить',
                      onClick: () => void retryCommand(),
                  })
                : showSnackbar(RUNTIME_ERRORS[runtime.error]);
        return () => hideSnackbar(shown);
    }, [runtime.error, runtime.failure]);

    // готовность окружения — отдельным уведомлением, не статусом сохранения
    useEffect(() => {
        if (runtime.ready > 0) showToast('Окружение готово');
    }, [runtime.ready]);

    // До отрисовки: иначе мелькнёт кадр, где ячейка уже есть, а фокус и выделение — ещё на прежней
    useLayoutEffect(() => {
        if (!focusTarget) return;
        focusCell(focusTarget.id);
        setFocusTarget(null);
    }, [focusTarget]);

    const ready = load === 'ready' && notebook.confirmed !== null;
    const cells = ready ? notebook.confirmed!.cells : [];
    const locked = structureLocked(notebook);
    const isEmpty = ready && cells.length === 0 && notebook.orphans.length === 0;
    const hasToolbar = load !== 'error' && !touch;
    const execution = ready ? runtimeStatus(runtime) : undefined;
    // проблемы и ход сохранения видны рядом со статусом выполнения, «Сохранено» его не перекрывает
    const status = ready ? saveStatus(notebook.status, runtime) : undefined;
    const hasCode = cells.some((cell) => cell.kind === 'code');
    const title =
        load === 'loading'
            ? 'Загрузка блокнота…'
            : load === 'error'
              ? 'Не удалось загрузить блокнот'
              : (notebook.meta?.name ?? '');

    // Новая ячейка появляется после ответа сервера — тогда в неё переходит фокус
    const handleAdd = (kind: CreatableKind, index?: number) => {
        void addCell(kind, index).then((created) => {
            if (!created) return;
            setSelected(created);
            setFresh(created);
            setFocusTarget({ id: created });
        });
    };
    // На время запроса кнопки неактивны и фокус с нажатой молча уходит на body: возвращаем его в ячейку
    const handleMove = (cellId: string, direction: -1 | 1) => {
        void moveCell(cellId, direction).then(() => {
            if (document.activeElement === document.body) setFocusTarget({ id: cellId });
        });
    };
    const handleDelete = (cellId: string) => {
        const index = cells.findIndex((cell) => cell.id === cellId);
        void deleteCell(cellId).then((deleted) => {
            if (!deleted) return;
            const next = useNotebookStore.getState().confirmed?.cells ?? [];
            const target = (next[index] ?? next[index - 1])?.id;
            if (target) setSelected(target);
            setFocusTarget({ id: target });
        });
    };

    // черновики удалённых на сервере ячеек — на их прежних местах
    const rows: ({ at: number } & ({ cell: CellData; index: number } | { orphan: Orphan }))[] = [
        ...cells.map((cell, index) => ({ at: index, cell, index })),
        ...notebook.orphans.map((orphan) => ({ at: orphan.index - 0.5, orphan })),
    ].toSorted((a, b) => a.at - b.at);

    return (
        <div className={styles.page}>
            <Space key="space" variant="plain" />
            <div key="content" className={styles.content}>
                <Header
                    key="header"
                    toolbar={
                        load !== 'error' && (
                            <>
                                {hasToolbar && (
                                    <AddCellChips
                                        key="chips"
                                        codeId={ADD_CODE_ID}
                                        disabled={!ready || locked}
                                        onAdd={handleAdd}
                                    />
                                )}
                                {ready && <RuntimeActions key="runtime" hasCode={hasCode} />}
                            </>
                        )
                    }
                >
                    <IconButton
                        key="back"
                        icon="back"
                        label="К списку блокнотов"
                        onClick={() => navigate({ to: '/' })}
                    />
                    <LogoMark
                        key="mark"
                        className={styles.mark}
                        width={24}
                        height={24}
                        aria-hidden="true"
                    />
                    <div key="heading" className={styles.heading}>
                        <h1 key="title" className={styles.title} title={title}>
                            {title}
                        </h1>
                        {ready && (
                            <p key="meta" className={styles.meta}>
                                <span key="count">
                                    {plural(cells.length, 'ячейка', 'ячейки', 'ячеек')}
                                </span>
                                {execution && (
                                    <SaveStatus
                                        key="run"
                                        tone={execution.tone}
                                        text={execution.text}
                                    />
                                )}
                                {status && (
                                    <SaveStatus
                                        key="status"
                                        tone={status.tone}
                                        text={status.text}
                                    />
                                )}
                            </p>
                        )}
                    </div>
                    <ProfileLink key="profile" />
                </Header>
                {load === 'loading' && (
                    <ul
                        key="skeletons"
                        className={clsx(styles.cells, styles.column)}
                        aria-hidden="true"
                    >
                        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                            <li key={`skeleton-${index}`}>
                                <CellSkeleton />
                            </li>
                        ))}
                    </ul>
                )}
                {ready && <RuntimeBanner key="runtime" className={styles.column} />}
                {ready && <ConflictBanner key="conflict" className={styles.column} />}
                {ready && !isEmpty && (
                    <div key="body" className={clsx(styles.body, styles.column)}>
                        <ul key="cells" className={styles.cells}>
                            {rows.map((row) =>
                                'orphan' in row ? (
                                    <li key={`orphan-${row.orphan.cellId}`}>
                                        <OrphanDraft orphan={row.orphan} />
                                    </li>
                                ) : (
                                    <li key={row.cell.id}>
                                        <CodeOrText
                                            key="cell"
                                            cell={row.cell}
                                            run={
                                                row.cell.kind === 'code'
                                                    ? cellRun(runtime, {
                                                          id: row.cell.id,
                                                          executionCount: row.cell.execution_count,
                                                          outputs: row.cell.outputs,
                                                      })
                                                    : undefined
                                            }
                                            text={notebook.drafts[row.cell.id] ?? row.cell.source}
                                            selected={selected === row.cell.id}
                                            tooLarge={notebook.tooLarge[row.cell.id] === true}
                                            canMoveUp={row.index > 0}
                                            canMoveDown={row.index < cells.length - 1}
                                            locked={locked}
                                            startEditing={fresh === row.cell.id}
                                            readOnly={touch}
                                            onInput={(text, composing) =>
                                                editSource(row.cell.id, text, composing)
                                            }
                                            onPaste={handlePaste}
                                            onCommit={() => commitSource(row.cell.id)}
                                            onFocus={() => setSelected(row.cell.id)}
                                            onLeave={() =>
                                                setSelected((current) =>
                                                    current === row.cell.id ? undefined : current,
                                                )
                                            }
                                            onMoveUp={() => handleMove(row.cell.id, -1)}
                                            onMoveDown={() => handleMove(row.cell.id, 1)}
                                            onDelete={() => handleDelete(row.cell.id)}
                                        />
                                        {!touch && row.index < cells.length - 1 && (
                                            <div key="insert" className={styles.insert}>
                                                <AddCellChips
                                                    disabled={locked}
                                                    onAdd={(kind) => handleAdd(kind, row.index + 1)}
                                                />
                                            </div>
                                        )}
                                    </li>
                                ),
                            )}
                        </ul>
                        {!touch && (
                            <div key="add" className={styles.add}>
                                <AddCellChips disabled={locked} onAdd={handleAdd} />
                            </div>
                        )}
                    </div>
                )}
                {isEmpty && touch && (
                    <StateBlock
                        key="empty-touch"
                        title="В блокноте пусто"
                        description="Добавлять ячейки можно на компьютере"
                    />
                )}
                {isEmpty && !touch && (
                    <StateBlock
                        key="empty"
                        title="В блокноте пусто"
                        description="Добавьте первую ячейку с кодом или текстом."
                        actionsClassName={styles.chips}
                    >
                        <AddCellChips disabled={locked} onAdd={handleAdd} />
                    </StateBlock>
                )}
            </div>
            {ready && <ConflictDialog key="dialog" />}
            <ScrollTop key="scroll-top" />
        </div>
    );
}
