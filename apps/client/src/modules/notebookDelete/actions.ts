import { isBffError, api } from '@api/bff';
import { flush, forgetNotebook, useNotebookStore } from '@stores/notebook';
import { peekPreloadedNotebook, takePreloadedNotebook } from '@stores/preloaded';
import { closeRuntime, sessionActive, useRuntimeStore, type RuntimeSession } from '@stores/runtime';

/** Итог удаления: `notFound` — чужой, отсутствующий или уже удалённый блокнот. */
export type DeleteResult = 'deleted' | 'notFound' | 'inUse' | 'failed';

/**
 * Свежая сессия блокнота для диалога удаления. Активная сессия пользователя не видна после
 * STOPPED, хотя очистка ещё блокирует DELETE: известную сессию блокнота дочитываем по её ID.
 * Стор окружения не меняет: ответ применяет вызывающий, если запрос ещё актуален.
 * @param notebookId удаляемый блокнот
 * @param known последняя известная сессия: из стора редактора или прошлой проверки
 * @returns сессия этого блокнота, null — её нет, `error` — состояние получить не удалось
 */
export async function readSession(
    notebookId: number,
    known: RuntimeSession | null,
): Promise<RuntimeSession | null | 'error'> {
    // завершённая и очищенная сессия уже не изменится
    const own =
        known?.notebook_id === notebookId && (sessionActive(known) || known.cleanup_error)
            ? known
            : null;
    try {
        const [active, updated] = await Promise.all([
            api('GET', '/api/runtime/active'),
            own &&
                api('POST', '/api/runtime/updates', {
                    contentType: 'application/json',
                    body: { sessionId: own.id, after: own.public_seq, executionIds: [] },
                }),
        ]);
        return active?.notebook_id === notebookId ? active : (updated?.session ?? null);
    } catch {
        return 'error';
    }
}

/** Блокнота больше нет: его черновики, сохранения, опрос и bootstrap-снимок не вернут данные. */
function forget(notebookId: number): void {
    forgetNotebook(notebookId);
    if (useRuntimeStore.getState().notebookId === notebookId) closeRuntime();
    if (peekPreloadedNotebook(notebookId)) takePreloadedNotebook(notebookId);
}

/**
 * Окончательно удаляет блокнот. Открытый блокнот сначала дожидается своих сохранений, чтобы ни
 * одно не ушло во время удаления. Окружение не останавливается, удаление не повторяется.
 */
export async function deleteNotebook(notebookId: number): Promise<DeleteResult> {
    // итог сохранения не важен: при удалении правки пропадут, при отказе останутся в сторе
    if (useNotebookStore.getState().notebookId === notebookId) await flush();
    try {
        await api('POST', '/api/notebooks/delete', {
            contentType: 'application/json',
            body: { id: notebookId },
        });
    } catch (error) {
        if (!isBffError(error)) return 'failed';
        if (error.code === 'NOT_FOUND') {
            forget(notebookId);
            return 'notFound';
        }
        return error.appCode === 'notebook_in_use' ? 'inUse' : 'failed';
    }
    forget(notebookId);
    return 'deleted';
}
