import { useEffect, useState } from '@cdd-team/react';

import { isRpcError, trpc, type Cell as CellData, type Notebook } from '@api/trpc';
import LogoMark from '@assets/logo-mark.svg?react';
import { Cell, CellSkeleton, cellDomId } from '@components/Cell/Cell';
import { Chip } from '@components/Chip/Chip';
import { Header } from '@components/Header/Header';
import { IconButton } from '@components/IconButton/IconButton';
import { ProfileMenu } from '@components/ProfileMenu/ProfileMenu';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { clsx } from '@cdd-team/clsx';
import { useNavigate, useParams } from '@cdd-team/router';
import { peekPreloadedNotebook, takePreloadedNotebook } from '@stores/preloaded';
import { useSessionStore } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { plural } from '@utils/plural';
import styles from './NotebookPage.module.css';

/** Сколько скелетонов показывать, пока блокнот загружается */
const SKELETON_COUNT = 4;

type CellKind = CellData['kind'];

type PageState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; notebook: Notebook };

/**
 * Загружает блокнот.
 * @param id id блокнота
 * @returns блокнот, 'missing', если такого блокнота нет, или undefined, если загрузить не удалось
 */
async function loadNotebook(id: number): Promise<Notebook | 'missing' | undefined> {
    if (!Number.isInteger(id)) return 'missing';
    try {
        return (await trpc.notebooks.get.query({ id })).notebook;
    } catch (error) {
        const code = isRpcError(error) ? error.data?.code : undefined;
        return code === 'NOT_FOUND' || code === 'BAD_REQUEST' ? 'missing' : undefined;
    }
}

/**
 * Добавляет ячейку в конец блокнота.
 * @param id id блокнота
 * @param kind вид ячейки
 * @returns новая ячейка или undefined, если добавить не удалось
 */
async function createCell(id: number, kind: CellKind): Promise<CellData | undefined> {
    try {
        const cell = await trpc.cells.create.mutate({ notebookId: id, kind });
        return cell.kind === 'code'
            ? { ...cell, kind: 'code', outputs: [], execution_count: null, output_truncated: false }
            : { ...cell, kind: 'markdown' };
    } catch {
        return undefined;
    }
}

/**
 * Удаляет ячейку.
 * @param id id блокнота
 * @param index порядковый номер ячейки, с нуля
 * @returns удалось ли удалить
 */
async function deleteCell(id: number, index: number): Promise<boolean> {
    try {
        await trpc.cells.delete.mutate({ notebookId: id, index });
        return true;
    } catch {
        return false;
    }
}

/**
 * Название в шапке.
 * @param state состояние страницы
 * @returns текст названия
 */
function title(state: PageState): string {
    switch (state.status) {
        case 'loading':
            return 'Загрузка блокнота…';
        case 'error':
            return 'Не удалось загрузить блокнот';
        case 'ready':
            return state.notebook.name;
    }
}

/** Свойства {@link AddCellChips}. */
interface AddCellChipsProps {
    onAdd: (kind: CellKind) => void;
}

/**
 * Чипы «+ Код» и «+ Текст».
 * @param props свойства чипов
 * @returns чипы
 */
function AddCellChips({ onAdd }: AddCellChipsProps) {
    return (
        <>
            <Chip key="code" onClick={() => onAdd('code')}>
                Код
            </Chip>
            <Chip key="markdown" onClick={() => onAdd('markdown')}>
                Текст
            </Chip>
        </>
    );
}

/**
 * Страница блокнота: шапка с названием и ячейки.
 * Ошибки загрузки, добавления и удаления ячейки — в снекбаре с «Повторить».
 * @returns страница
 */
export function NotebookPage() {
    const navigate = useNavigate();
    const login = useSessionStore((state) => state.user?.login ?? '');
    const id = Number(useParams({ from: '/_auth/notebooks/$notebookId' }).notebookId);
    // При прямом открытии своего блокнота BFF уже положил его в bootstrap: первый показ без запроса
    const preloaded = peekPreloadedNotebook(id)?.notebook;
    const [page, setPage] = useState<PageState>(
        preloaded ? { status: 'ready', notebook: preloaded } : { status: 'loading' },
    );
    const [attempt, setAttempt] = useState(0);
    const [addedId, setAddedId] = useState<string | undefined>(undefined);
    // Ячейки удаляются по номеру, поэтому добавление и удаление идут строго по одному
    const [busy, setBusy] = useState(false);
    const [life] = useState({ alive: true });

    useEffect(() => {
        let alive = true;
        const retry = () => {
            hideSnackbar();
            setAttempt((current) => current + 1);
        };
        const first = takePreloadedNotebook(id)?.notebook;
        if (first) {
            setPage({ status: 'ready', notebook: first });
            return;
        }
        setPage({ status: 'loading' });
        void loadNotebook(id).then((notebook) => {
            if (!alive) return;
            // отсутствующий и чужой блокнот (одинаковый NOT_FOUND) — как прямое открытие: на /404
            if (notebook === 'missing') {
                void navigate({ to: '/404', replace: true });
                return;
            }
            if (notebook) {
                setPage({ status: 'ready', notebook });
                return;
            }
            setPage({ status: 'error' });
            showSnackbar('Не удалось загрузить блокнот', { label: 'Повторить', onClick: retry });
        });
        return () => {
            alive = false;
            hideSnackbar();
        };
    }, [id, attempt, navigate]);

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    useEffect(() => {
        if (addedId === undefined) return;
        document.getElementById(cellDomId(addedId))?.parentElement?.scrollIntoView({
            block: 'nearest',
        });
    }, [addedId]);

    const addCell = async (kind: CellKind) => {
        if (page.status !== 'ready' || busy) return;
        setBusy(true);
        hideSnackbar();

        const cell = await createCell(id, kind);
        if (!life.alive) return;
        setBusy(false);
        if (!cell) {
            showSnackbar('Не удалось добавить ячейку', {
                label: 'Повторить',
                onClick: () => void addCell(kind),
            });
            return;
        }
        setPage((current) =>
            current.status === 'ready' && current.notebook.id === id
                ? {
                      status: 'ready',
                      notebook: { ...current.notebook, cells: [...current.notebook.cells, cell] },
                  }
                : current,
        );
        setAddedId(cell.id);
    };
    const handleAdd = (kind: CellKind) => void addCell(kind);

    const removeCell = async (cellId: string) => {
        if (page.status !== 'ready' || busy) return;
        const index = page.notebook.cells.findIndex((cell) => cell.id === cellId);
        if (index === -1) return;
        setBusy(true);
        hideSnackbar();

        const deleted = await deleteCell(id, index);
        if (!life.alive) return;
        setBusy(false);
        if (!deleted) {
            showSnackbar('Не удалось удалить ячейку', {
                label: 'Повторить',
                onClick: () => void removeCell(cellId),
            });
            return;
        }
        setPage((current) =>
            current.status === 'ready' && current.notebook.id === id
                ? {
                      status: 'ready',
                      notebook: {
                          ...current.notebook,
                          cells: current.notebook.cells.filter((cell) => cell.id !== cellId),
                      },
                  }
                : current,
        );
    };

    const cells = page.status === 'ready' ? page.notebook.cells : [];
    const isEmpty = page.status === 'ready' && cells.length === 0;
    const hasToolbar = page.status === 'loading' || page.status === 'ready';

    return (
        <div className={styles.page}>
            <Space key="space" variant="plain" />
            <div key="content" className={styles.content}>
                <Header key="header" toolbar={hasToolbar && <AddCellChips onAdd={handleAdd} />}>
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
                        <h1 key="title" className={styles.title} title={title(page)}>
                            {title(page)}
                        </h1>
                        {page.status === 'ready' && (
                            <p key="meta" className={styles.meta}>
                                {plural(cells.length, 'ячейка', 'ячейки', 'ячеек')}
                            </p>
                        )}
                    </div>
                    <ProfileMenu key="profile" login={login} />
                </Header>
                {page.status === 'loading' && (
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
                {page.status === 'ready' && !isEmpty && (
                    <div key="body" className={clsx(styles.body, styles.column)}>
                        <ul key="cells" className={styles.cells}>
                            {cells.map((cell) => (
                                <li key={cell.id}>
                                    <Cell cell={cell} onDelete={() => void removeCell(cell.id)} />
                                </li>
                            ))}
                        </ul>
                        <div key="add" className={styles.add}>
                            <AddCellChips onAdd={handleAdd} />
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
                        <AddCellChips onAdd={handleAdd} />
                    </StateBlock>
                )}
            </div>
        </div>
    );
}
