import { isRpcError, trpc } from '@api/trpc';
import { flush, forgetNotebook, useNotebookStore } from '@stores/notebook';
import { peekPreloadedNotebook, takePreloadedNotebook } from '@stores/preloaded';
import { adoptSession, closeRuntime, useRuntimeStore } from '@stores/runtime';
import { deleteGate, type DeleteGate } from './gate';

/** Итог удаления: `notFound` — чужой, отсутствующий или уже удалённый блокнот. */
export type DeleteResult = 'deleted' | 'notFound' | 'inUse' | 'failed';

/**
 * Допуск к удалению по активной сессии пользователя с сервера. Сессия открытого блокнота заодно
 * обновляет его стор окружения: после 409 из другой вкладки появится «Завершить окружение».
 * @returns допуск или `error`, если состояние окружения получить не удалось
 */
export async function checkDeleteGate(notebookId: number): Promise<DeleteGate | 'error'> {
    try {
        const session = await trpc.runtime.active.query();
        adoptSession(session);
        return deleteGate(session, notebookId);
    } catch {
        return 'error';
    }
}

/**
 * Запрет после `409 notebook_in_use`. Если активной сессии не видно, сервер всё равно занят
 * фоновой очисткой или работой, недоступной фронту: показываем ожидание.
 */
export async function inUseGate(notebookId: number): Promise<'stopFirst' | 'waitStop'> {
    return (await checkDeleteGate(notebookId)) === 'stopFirst' ? 'stopFirst' : 'waitStop';
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
