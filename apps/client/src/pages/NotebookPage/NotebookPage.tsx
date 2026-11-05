import { useEffect, useLayoutEffect, useState } from '@cdd-team/react';

import { isRpcError, trpc, type Cell as CellData, type NotebookPageData } from '@api/trpc';
import LogoMark from '@assets/logo-mark.svg?react';
import { Cell, CellSkeleton, cellEditorId } from '@components/Cell/Cell';
import { Chip } from '@components/Chip/Chip';
import { Header } from '@components/Header/Header';
import { IconButton } from '@components/IconButton/IconButton';
import { ProfileLink } from '@components/ProfileLink/ProfileLink';
import { SaveStatus, type SaveStatusTone } from '@components/SaveStatus/SaveStatus';
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
    type SaveStatus as SaveState,
} from '@stores/notebook';
import { peekPreloadedNotebook, takePreloadedNotebook } from '@stores/preloaded';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { plural } from '@utils/plural';
import { ConflictBanner, ConflictDialog, OrphanDraft } from './Conflict';
import styles from './NotebookPage.module.css';

/** Сколько скелетонов показывать, пока блокнот загружается */
const SKELETON_COUNT = 4;

type CellKind = CellData['kind'];

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

const STATUS: Partial<Record<SaveState, { tone: SaveStatusTone; text: string }>> = {
    dirty: { tone: 'error', text: 'Изменения не сохранены' },
    saving: { tone: 'progress', text: 'Сохраняем…' },
    saved: { tone: 'success', text: 'Сохранено' },
    error: { tone: 'error', text: 'Не удалось сохранить изменения' },
    conflict: { tone: 'error', text: 'Конфликт сохранения: файл изменён в другой вкладке' },
};

// «+ Код» в шапке: есть всегда, в том числе в пустом блокноте
const ADD_CODE_ID = 'add-code';

const ERRORS = {
    save: 'Не удалось сохранить изменения',
    too_many_cells: 'В блокноте уже 1000 ячеек — больше добавить нельзя',
    notebook_gone: 'Блокнот недоступен: возможно, его удалили',
};

// Больше лимита не вставляется: такой исходник не сохранить, а огромный редактор Chrome рисует со
// вспышками. Помещающаяся часть вставляется как обычный ввод — с отменой по Ctrl+Z
const handlePaste = (event: ClipboardEvent): void => {
    const editor = event.target as HTMLTextAreaElement;
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    const part = pastedPart(editor.value, editor.selectionStart, editor.selectionEnd, pasted);
    if (part === pasted) return;
    event.preventDefault();
    if (part) document.execCommand('insertText', false, part);
    showSnackbar('Вставлена только часть текста: в ячейке максимум 64 КиБ');
};

/** Свойства {@link AddCellChips}. */
interface AddCellChipsProps {
    /** id чипа «+ Код»: у чипов в шапке */
    codeId?: string;
    disabled: boolean;
    onAdd: (kind: CellKind) => void;
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
    const notebook = useNotebookStore();

    // до первой отрисовки: блокнот из bootstrap открывается в сторе без мигания скелетона
    useLayoutEffect(() => {
        let alive = true;
        const first = takePreloadedNotebook(id);
        if (first) {
            openNotebook(first);
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
    useEffect(() => () => leaveNotebook(), [id]);

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
    const hasToolbar = load !== 'error';
    const status = ready ? STATUS[notebook.status] : undefined;
    const title =
        load === 'loading'
            ? 'Загрузка блокнота…'
            : load === 'error'
              ? 'Не удалось загрузить блокнот'
              : (notebook.meta?.name ?? '');

    // Новая ячейка появляется после ответа сервера — тогда в неё переходит фокус
    const handleAdd = (kind: CellKind, index?: number) => {
        void addCell(kind, index).then((created) => {
            if (!created) return;
            setSelected(created);
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
                        hasToolbar && (
                            <AddCellChips
                                codeId={ADD_CODE_ID}
                                disabled={!ready || locked}
                                onAdd={handleAdd}
                            />
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
                                        <Cell
                                            cell={row.cell}
                                            text={notebook.drafts[row.cell.id] ?? row.cell.source}
                                            selected={selected === row.cell.id}
                                            tooLarge={notebook.tooLarge[row.cell.id] === true}
                                            canMoveUp={row.index > 0}
                                            canMoveDown={row.index < cells.length - 1}
                                            locked={locked}
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
                                        {row.index < cells.length - 1 && (
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
                        <div key="add" className={styles.add}>
                            <AddCellChips disabled={locked} onAdd={handleAdd} />
                        </div>
                    </div>
                )}
                {isEmpty && (
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
        </div>
    );
}
