import { useEffect, useRef, useState } from '@cdd-team/react';

import { trpc, type NotebookListPage, type NotebookSummary } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Header } from '@components/Header/Header';
import { Logo } from '@components/Logo/Logo';
import { NotebookCard, NotebookCardSkeleton } from '@components/NotebookCard/NotebookCard';
import { ProfileLink } from '@components/ProfileLink/ProfileLink';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { Link } from '@cdd-team/router';
import { checkDeleteGate } from '@modules/notebookDelete/actions';
import { DeleteNotebookDialog } from '@modules/notebookDelete/DeleteNotebookDialog';
import type { DeleteGate } from '@modules/notebookDelete/gate';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { plural } from '@utils/plural';
import { CreateNotebookDialog } from './CreateNotebookDialog';
import { PAGE_SIZE, appendPage, fromFirstPage, removeItem, type Loaded } from './list';
import styles from './NotebooksPage.module.css';

/** Сколько скелетонов показывать, пока список загружается */
const SKELETON_COUNT = 6;

type ListState =
    | { status: 'loading' }
    | { status: 'error' }
    | {
          status: 'ready';
          loaded: Loaded;
          more: 'idle' | 'loading' | 'error';
          /** Номер загрузки списка: ответ догрузки прежнего списка отбрасывается */
          attempt: number;
      };

/**
 * Загружает страницу блокнотов в порядке backend.
 * @param cursor `next_cursor` предыдущей страницы; без него — первая страница
 * @returns страница или undefined, если загрузить не удалось
 */
async function loadPage(cursor?: string): Promise<NotebookListPage | undefined> {
    try {
        return await trpc.notebooks.list.query({ limit: PAGE_SIZE, cursor });
    } catch {
        return undefined;
    }
}

/** Подзаголовок под приветствием. */
function subtitle(state: ListState): string {
    switch (state.status) {
        case 'loading':
            return 'Загружаем блокноты…';
        case 'error':
            return 'Не удалось загрузить блокноты';
        case 'ready':
            return state.loaded.totalCount === 0
                ? 'Пока ни одного блокнота'
                : plural(state.loaded.totalCount, 'блокнот', 'блокнота', 'блокнотов');
    }
}

/**
 * Главная: список блокнотов.
 * Ошибка загрузки — в снекбаре: «Повторить» загружает список ещё раз.
 */
export function NotebooksPage() {
    const [list, setList] = useState<ListState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const sentinel = useRef<HTMLDivElement>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<{
        notebook: NotebookSummary;
        gate: DeleteGate;
    } | null>(null);
    /**
     * Идёт проверка окружения перед диалогом: повторные нажатия корзин не считаются. Кнопку не
     * отключаем — иначе она теряет фокус, и диалог не вернёт его к ней.
     */
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        let alive = true;
        const retry = () => {
            hideSnackbar();
            setList({ status: 'loading' });
            setAttempt((current) => current + 1);
        };
        void loadPage().then((page) => {
            if (!alive) return;
            if (page) {
                setList({ status: 'ready', loaded: fromFirstPage(page), more: 'idle', attempt });
                return;
            }
            setList({ status: 'error' });
            showSnackbar('Не удалось загрузить блокноты', { label: 'Повторить', onClick: retry });
        });
        return () => {
            alive = false;
            hideSnackbar();
        };
    }, [attempt]);

    const loadMore = async () => {
        if (list.status !== 'ready' || list.more === 'loading') return;
        const { nextCursor: cursor } = list.loaded;
        if (cursor === null) return;
        const mine = list.attempt;
        setList({ ...list, more: 'loading' });
        const page = await loadPage(cursor);
        setList((current) => {
            // список перезагружен или курсор уже сдвинут — ответ устарел
            if (
                current.status !== 'ready' ||
                current.attempt !== mine ||
                current.loaded.nextCursor !== cursor
            )
                return current;
            return page
                ? { ...current, loaded: appendPage(current.loaded, page), more: 'idle' }
                : { ...current, more: 'error' };
        });
    };

    const canLoadMore =
        list.status === 'ready' && list.loaded.nextCursor !== null && list.more === 'idle';
    const loadedCount = list.status === 'ready' ? list.loaded.items.length : 0;
    useEffect(() => {
        const node = sentinel.current;
        if (!canLoadMore || !node) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) void loadMore();
        });
        observer.observe(node);
        return () => observer.disconnect();
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [canLoadMore, loadedCount]);

    const isEmpty =
        list.status === 'ready' &&
        list.loaded.items.length === 0 &&
        list.loaded.nextCursor === null;
    const openCreate = () => setCreating(true);
    const content = useRef<HTMLDivElement>(null);
    // Один key списка при загрузке и после неё сохраняет DOM-якорь для ResizeObserver.
    const grid = useRef<HTMLUListElement>(null);
    // сетки нет в пустом списке и при ошибке: горизонт — под основным блоком
    const hasGrid = list.status === 'loading' || (list.status === 'ready' && !isEmpty);

    const askDelete = async (notebook: NotebookSummary) => {
        if (checking) return;
        setChecking(true);
        const gate = await checkDeleteGate(notebook.id);
        setChecking(false);
        if (gate === 'error') showSnackbar('Не удалось удалить блокнот. Попробуйте ещё раз');
        else setDeleting({ notebook, gate });
    };

    const onGone = (id: number, result: 'deleted' | 'notFound') => {
        setDeleting(null);
        if (result === 'notFound') {
            setList({ status: 'loading' });
            setAttempt((current) => current + 1);
            return;
        }
        setList((current) =>
            current.status === 'ready'
                ? { ...current, loaded: removeItem(current.loaded, id) }
                : current,
        );
    };

    return (
        <div className={styles.page}>
            <Space
                key="space"
                anchor={hasGrid ? grid : content}
                edge={hasGrid ? 'above' : 'below'}
            />
            <div key="content" ref={content} className={styles.content}>
                <Header key="header">
                    <Link
                        key="home"
                        to="/"
                        className={styles.home}
                        aria-label="Cellestial — на главную"
                    >
                        <Logo />
                    </Link>
                    <ProfileLink key="profile" />
                </Header>
                <div key="hero" className={styles.hero}>
                    <div key="heading" className={styles.heading}>
                        <h1 key="title" className={styles.title}>
                            {isEmpty ? 'Добро пожаловать на орбиту' : 'С возвращением на орбиту'}
                        </h1>
                        <p key="subtitle" className={styles.subtitle}>
                            {subtitle(list)}
                        </p>
                    </div>
                    {!isEmpty && (
                        <Button
                            key="create"
                            icon="plus"
                            className={styles.create}
                            onClick={openCreate}
                        >
                            Новый блокнот
                        </Button>
                    )}
                </div>
                {list.status === 'loading' && (
                    <ul key="grid" ref={grid} className={styles.grid} aria-hidden="true">
                        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                            <li key={`skeleton-${index}`}>
                                <NotebookCardSkeleton />
                            </li>
                        ))}
                    </ul>
                )}
                {list.status === 'ready' && !isEmpty && (
                    <ul key="grid" ref={grid} className={styles.grid}>
                        {list.loaded.items.map((notebook) => (
                            <li key={notebook.id}>
                                <NotebookCard
                                    notebook={notebook}
                                    onDelete={() => void askDelete(notebook)}
                                />
                            </li>
                        ))}
                        {list.more === 'loading' &&
                            Array.from({ length: 3 }, (_, index) => (
                                <li key={`more-${index}`} aria-hidden="true">
                                    <NotebookCardSkeleton />
                                </li>
                            ))}
                    </ul>
                )}
                {canLoadMore && <div key="sentinel" ref={sentinel} aria-hidden="true" />}
                {list.status === 'ready' && list.more === 'error' && (
                    <div key="more-error" className={styles.moreError}>
                        <Button onClick={() => void loadMore()}>Повторить загрузку</Button>
                    </div>
                )}
                {isEmpty && (
                    <StateBlock
                        key="empty"
                        title="Блокнотов пока нет"
                        description="Создайте первый — он откроется сразу. Python и популярные библиотеки уже установлены."
                    >
                        <Button icon="plus" onClick={openCreate}>
                            Новый блокнот
                        </Button>
                    </StateBlock>
                )}
            </div>
            {creating && <CreateNotebookDialog key="create" onClose={() => setCreating(false)} />}
            {deleting && (
                <DeleteNotebookDialog
                    key="delete"
                    notebook={deleting.notebook}
                    gate={deleting.gate}
                    place="home"
                    onClose={() => setDeleting(null)}
                    onGone={(result) => onGone(deleting.notebook.id, result)}
                />
            )}
        </div>
    );
}
