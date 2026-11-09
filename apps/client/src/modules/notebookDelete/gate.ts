import type { RuntimeSession } from '@stores/runtime';

/** Что показать по нажатию корзины: подтверждение или запрет из-за окружения блокнота. */
export type DeleteGate = 'confirm' | 'stopFirst' | 'waitStop';

const STOPPING_STAGES = new Set<RuntimeSession['stage']>([
    'stopping',
    'deleting_environment',
    'cleanup_pending',
]);

/**
 * Допуск к удалению по активной сессии пользователя. Окончательно решает DELETE на сервере.
 * @param session активная сессия пользователя в любом блокноте или null
 * @param notebookId выбранный блокнот
 * @returns `confirm` — сессии этого блокнота нет или она завершена; `waitStop` — завершается
 * или ждёт очистки; `stopFirst` — окружение работает
 */
export function deleteGate(session: RuntimeSession | null, notebookId: number): DeleteGate {
    if (!session || session.notebook_id !== notebookId) return 'confirm';
    if (session.state === 'STOPPING' || STOPPING_STAGES.has(session.stage)) return 'waitStop';
    if (session.state === 'STOPPED' || session.state === 'FAILED') return 'confirm';
    return 'stopFirst';
}
