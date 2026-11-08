import type { Go } from './go/api.ts';
import type { NotebookContent, RuntimeQueueSnapshot, RuntimeSession } from './go/client.ts';

/**
 * Данные страницы блокнота: результат `notebooks.get` и поле `notebookPage` bootstrap.
 * `active_session` — активная сессия пользователя в любом блокноте; `runtime_queue` — очередь,
 * только если эта сессия открытого блокнота.
 */
export type NotebookPage = {
    notebook: {
        id: number;
        name: string;
        created_at: string;
        updated_at: string;
        hash: string;
        cells: NotebookContent['cells'];
    };
    active_session: RuntimeSession | null;
    runtime_queue: RuntimeQueueSnapshot | null;
};

/**
 * Общий загрузчик блокнота для HTML и `notebooks.get`: метаданные — из `GET /notebooks/{id}`,
 * согласованные `hash` и ячейки — из одного ответа `GET /notebooks/{id}/content`, активная
 * сессия — из `GET /runtime-sessions/active`; три чтения параллельно. Очередь читается после
 * `/active` и только для сессии этого блокнота. Сбой любого чтения — ошибка, а не пустые данные.
 * @param go вызовы Go от имени сессии
 */

export async function loadNotebook(go: Go, id: number): Promise<NotebookPage> {
    const active = go.getActiveRuntimeSession();
    const queue = active.then((session) =>
        session?.notebook_id === id ? go.getRuntimeQueue(session.id) : null,
    );
    const [meta, content, activeSession, runtimeQueue] = await Promise.all([
        go.getNotebook(id),
        go.getNotebookContent(id),
        active,
        queue,
    ]);
    return {
        notebook: {
            id: meta.id,
            name: meta.name,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
            hash: content.hash,
            cells: content.cells,
        },
        active_session: activeSession,
        runtime_queue: runtimeQueue,
    };
}
