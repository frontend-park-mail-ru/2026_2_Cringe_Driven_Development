import { isRpcError, trpc } from '@api/trpc';
import { flush, forgetNotebook, useNotebookStore } from '@stores/notebook';
import { peekPreloadedNotebook, takePreloadedNotebook } from '@stores/preloaded';
import { closeRuntime, useRuntimeStore } from '@stores/runtime';
import { deleteGate, type DeleteGate } from './gate';

/** Итог удаления: `notFound` — чужой, отсутствующий или уже удалённый блокнот. */
export type DeleteResult = 'deleted' | 'notFound' | 'inUse' | 'failed';

/**
 * Допуск к удалению по активной сессии пользователя с сервера.
 * @param notebookId выбранный блокнот
 * @returns допуск или `error`, если состояние окружения получить не удалось
 */
export async function checkDeleteGate(notebookId: number): Promise<DeleteGate | 'error'> {
    try {
        return deleteGate(await trpc.runtime.active.query(), notebookId);
    } catch {
        return 'error';
    }
}

/**
 * Запрет после `409 notebook_in_use`. Если активной сессии не видно, сервер всё равно занят
 * фоновой очисткой или работой, недоступной фронту: показываем ожидание.
 * @param notebookId выбранный блокнот
 * @returns какой запрет показать
 */
export async function inUseGate(notebookId: number): Promise<'stopFirst' | 'waitStop'> {
    return (await checkDeleteGate(notebookId)) === 'stopFirst' ? 'stopFirst' : 'waitStop';
}

// Блокнота больше нет: его черновики, сохранения, опрос и bootstrap-снимок не вернут данные
function forget(notebookId: number): void {
    forgetNotebook(notebookId);
    if (useRuntimeStore.getState().notebookId === notebookId) closeRuntime();
    if (peekPreloadedNotebook(notebookId)) takePreloadedNotebook(notebookId);
}

/**
 * Окончательно удаляет блокнот. Открытый блокнот сначала дожидается своих сохранений, чтобы ни
 * одно не ушло во время удаления. Окружение не останавливается, удаление не повторяется.
 * @param notebookId выбранный блокнот
 * @returns итог удаления
 */
export async function deleteNotebook(notebookId: number): Promise<DeleteResult> {
    // итог сохранения не важен: при удалении правки пропадут, при отказе останутся в сторе
    if (useNotebookStore.getState().notebookId === notebookId) await flush();
    try {
        await trpc.notebooks.delete.mutate({ id: notebookId });
    } catch (error) {
        if (!isRpcError(error)) return 'failed';
        if (error.data?.code === 'NOT_FOUND') {
            forget(notebookId);
            return 'notFound';
        }
        return error.data?.appCode === 'notebook_in_use' ? 'inUse' : 'failed';
    }
    forget(notebookId);
    return 'deleted';
}
