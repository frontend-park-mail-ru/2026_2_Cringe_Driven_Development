import { useEffect, useState } from '@maninthecoat/react';

import { api, type NotebookSummary } from '@api/client';
import { Button } from '@components/Button/Button';
import { Header } from '@components/Header/Header';
import { Logo } from '@components/Logo/Logo';
import { NotebookCard, NotebookCardSkeleton } from '@components/NotebookCard/NotebookCard';
import { ProfileMenu } from '@components/ProfileMenu/ProfileMenu';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { Link } from '@modules/router';
import { useSessionStore } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { plural } from '@utils/plural';
import { CreateNotebookDialog } from './CreateNotebookDialog';
import './NotebooksPage.css';

/** Сколько скелетонов показывать, пока список загружается */
const SKELETON_COUNT = 6;

type ListState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; notebooks: NotebookSummary[] };

/**
 * Загружает блокноты пользователя, недавно изменённые — первыми.
 * @returns {Promise<NotebookSummary[] | undefined>} блокноты или undefined, если загрузить не
 *     удалось
 */
async function loadNotebooks(): Promise<NotebookSummary[] | undefined> {
    try {
        const { data } = await api.GET('/notebooks');
        return data?.toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    } catch {
        return undefined;
    }
}

/**
 * Подзаголовок под приветствием.
 * @param {ListState} state состояние списка
 * @returns {string} текст подзаголовка
 */
function subtitle(state: ListState): string {
    switch (state.status) {
        case 'loading':
            return 'Загружаем блокноты…';
        case 'error':
            return 'Не удалось загрузить блокноты';
        case 'ready':
            return state.notebooks.length === 0
                ? 'Пока ни одного блокнота'
                : plural(state.notebooks.length, 'блокнот', 'блокнота', 'блокнотов');
    }
}

/**
 * Главная: список блокнотов.
 * Ошибка загрузки — в снекбаре: «Повторить» загружает список ещё раз.
 * @returns {JSX.Element} страница
 */
export function NotebooksPage() {
    const login = useSessionStore((state) => state.user?.login ?? '');
    const [list, setList] = useState<ListState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        let alive = true;
        const retry = () => {
            hideSnackbar();
            setList({ status: 'loading' });
            setAttempt((current) => current + 1);
        };
        void loadNotebooks().then((notebooks) => {
            if (!alive) return;
            if (notebooks) {
                setList({ status: 'ready', notebooks });
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

    const isEmpty = list.status === 'ready' && list.notebooks.length === 0;
    const openCreate = () => setCreating(true);

    return (
        <div className="notebooks">
            <Space key="space" variant="home" />
            <div key="content" className="notebooks__content">
                <Header key="header">
                    <Link
                        key="home"
                        to="/"
                        className="notebooks__home"
                        aria-label="Cellestial — на главную"
                    >
                        <Logo />
                    </Link>
                    <ProfileMenu key="profile" login={login} />
                </Header>
                <div key="hero" className="notebooks__hero">
                    <div key="heading" className="notebooks__heading">
                        <h1 key="title" className="notebooks__title">
                            {isEmpty ? 'Добро пожаловать на орбиту' : 'С возвращением на орбиту'}
                        </h1>
                        <p key="subtitle" className="notebooks__subtitle">
                            {subtitle(list)}
                        </p>
                    </div>
                    {!isEmpty && (
                        <Button key="create" icon="plus" onClick={openCreate}>
                            Новый блокнот
                        </Button>
                    )}
                </div>
                {list.status === 'loading' && (
                    <ul key="skeletons" className="notebooks__grid" aria-hidden="true">
                        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                            <li key={`skeleton-${index}`}>
                                <NotebookCardSkeleton />
                            </li>
                        ))}
                    </ul>
                )}
                {list.status === 'ready' && !isEmpty && (
                    <ul key="grid" className="notebooks__grid">
                        {list.notebooks.map((notebook) => (
                            <li key={notebook.id}>
                                <NotebookCard notebook={notebook} />
                            </li>
                        ))}
                    </ul>
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
        </div>
    );
}
