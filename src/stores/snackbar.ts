import { create } from '@maninthecoat/zustand';
import type { SnackbarMessage } from '@components/Snackbar/Snackbar';

interface SnackbarState {
    /** Снекбар на экране; null — снекбара нет */
    snackbar: SnackbarMessage | null;
}

/** Стор снекбара: висит, пока его не уберут, новый заменяет предыдущий. */
export const useSnackbarStore = create<SnackbarState>()(() => ({ snackbar: null }));

let nextId = 1;

/**
 * Показывает снекбар с ошибкой. Нажатие на действие убирает снекбар.
 * @param {string} text текст ошибки
 * @param {SnackbarMessage['action']} [action] действие справа от текста
 * @returns {number} id показа: по нему можно убрать именно этот снекбар
 */
export function showSnackbar(text: string, action?: SnackbarMessage['action']): number {
    const id = nextId++;
    const onAction = action && {
        label: action.label,
        onClick: () => {
            hideSnackbar(id);
            action.onClick();
        },
    };
    useSnackbarStore.setState({ snackbar: { id, text, action: onAction } });
    return id;
}

/**
 * Убирает снекбар.
 * @param {number} [id] убрать, только если на экране этот показ, а не чужой
 */
export function hideSnackbar(id?: number): void {
    const { snackbar } = useSnackbarStore.getState();
    if (!snackbar || (id !== undefined && snackbar.id !== id)) return;
    useSnackbarStore.setState({ snackbar: null });
}
