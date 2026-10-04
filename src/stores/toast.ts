import { create } from '@maninthecoat/zustand';
import type { ToastMessage } from '@components/Toast/Toast';

interface ToastState {
    /** Тост на экране; null — тоста нет */
    toast: ToastMessage | null;
}

/** Стор тоста: показывается один, новый заменяет предыдущий. */
export const useToastStore = create<ToastState>()(() => ({ toast: null }));

const HIDE_AFTER_MS = 4000;

let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Показывает тост и прячет его через 4 секунды.
 * @param text текст сообщения
 */
export function showToast(text: string): void {
    clearTimeout(hideTimer);
    useToastStore.setState({ toast: { id: nextId++, text } });
    hideTimer = setTimeout(() => useToastStore.setState({ toast: null }), HIDE_AFTER_MS);
}
