import { create } from '@maninthecoat/zustand';
import type { SnackbarMessage } from '../components/Snackbar/Snackbar';

interface SnackbarState {
    /** Снекбар на экране; null — снекбара нет */
    snackbar: SnackbarMessage | null;
}

/** Стор снекбара: висит, пока его не уберут, новый заменяет предыдущий. */
export const useSnackbar = create<SnackbarState>()(() => ({ snackbar: null }));

let nextId = 1;

/**
 * Показывает снекбар с ошибкой.
 * @param text текст ошибки
 * @param action действие справа от текста
 */
export function showSnackbar(text: string, action?: SnackbarMessage['action']): void {
    useSnackbar.setState({ snackbar: { id: nextId++, text, action } });
}

/** Убирает снекбар. */
export function hideSnackbar(): void {
    if (useSnackbar.getState().snackbar) useSnackbar.setState({ snackbar: null });
}
