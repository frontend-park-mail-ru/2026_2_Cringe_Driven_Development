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
    closeNotebook,
    commitSource,
    deleteCell,
    editSource,
    moveCell,
    openNotebook,
    retry,
    structureLocked,
    useNotebookStore,
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

/** Свойства {@link AddCellChips}. */
interface AddCellChipsProps {
    disabled: boolean;
    onAdd: (kind: CellKind) => void;
}

/**
 * Чипы «+ Код» и «+ Текст».
 * @param props свойства чипов
 * @returns чипы
 */
function AddCellChips({ disabled, onAdd }: AddCellChipsProps) {
    return (
        <>
            <Chip key="code" disabled={disabled} onClick={() => onAdd('code')}>
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
    document.querySelector<HTMLButtonElement>(`.${styles.add} button`)?.focus();
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

    useEffect(() => () => closeNotebook(), [id]);

    // Несохранённый текст: браузер предупредит перед уходом и перезагрузкой
    const unsaved = notebook.status !== 'idle' && notebook.status !== 'saved';
    useEffect(() => {
        if (!unsaved) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [unsaved]);

    useEffect(() => {
        if (notebook.error === 'save') {
            const shown = showSnackbar('Не удалось сохранить изменения', {
                label: 'Повторить',
                onClick: () => void retry(),
            });
            return () => hideSnackbar(shown);
        }
        if (notebook.error === 'too_many_cells') {
            const shown = showSnackbar('В блокноте уже 1000 ячеек — больше добавить нельзя');
            return () => hideSnackbar(shown);
        }
        if (notebook.error === 'notebook_gone') {
            const shown = showSnackbar('Блокнот недоступен: возможно, его удалили');
            return () => hideSnackbar(shown);
        }
    }, [notebook.error]);

    useEffect(() => {
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
    const handleAdd = (kind: CellKind) => {
        void addCell(kind).then((created) => {
            if (created) setFocusTarget({ id: created });
        });
    };
    const handleDelete = (cellId: string) => {
        const index = cells.findIndex((cell) => cell.id === cellId);
        void deleteCell(cellId).then((deleted) => {
            if (!deleted) return;
            const next = useNotebookStore.getState().confirmed?.cells ?? [];
            setFocusTarget({ id: (next[index] ?? next[index - 1])?.id });
        });
    };

    // черновики удалённых на сервере ячеек — на их прежних местах
    const rows = [
        ...cells.map((cell, index) => ({ index, cell, orphan: undefined })),
        ...notebook.orphans.map((orphan) => ({
            index: orphan.index - 0.5,
            cell: undefined,
            orphan,
        })),
    ].toSorted((a, b) => a.index - b.index);

    return (
        <div className={styles.page}>
            <Space key="space" variant="plain" />
            <div key="content" className={styles.content}>
                <Header
                    key="header"
                    toolbar={
                        hasToolbar && <AddCellChips disabled={!ready || locked} onAdd={handleAdd} />
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
                {ready && notebook.conflict.phase !== 'none' && (
                    <ConflictBanner key="conflict" className={styles.column} />
                )}
                {ready && !isEmpty && (
                    <div key="body" className={clsx(styles.body, styles.column)}>
                        <ul key="cells" className={styles.cells}>
                            {rows.map(({ index, cell, orphan }) =>
                                orphan ? (
                                    <li key={`orphan-${orphan.cellId}`}>
                                        <OrphanDraft orphan={orphan} />
                                    </li>
                                ) : (
                                    <li key={cell!.id}>
                                        <Cell
                                            cell={cell!}
                                            text={notebook.drafts[cell!.id] ?? cell!.source}
                                            selected={selected === cell!.id}
                                            tooLarge={notebook.tooLarge[cell!.id] === true}
                                            canMoveUp={index > 0}
                                            canMoveDown={index < cells.length - 1}
                                            locked={locked}
                                            onInput={(text, composing) =>
                                                editSource(cell!.id, text, composing)
                                            }
                                            onCommit={() => commitSource(cell!.id)}
                                            onFocus={() => setSelected(cell!.id)}
                                            onMoveUp={() => void moveCell(cell!.id, -1)}
                                            onMoveDown={() => void moveCell(cell!.id, 1)}
                                            onDelete={() => handleDelete(cell!.id)}
                                        />
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
