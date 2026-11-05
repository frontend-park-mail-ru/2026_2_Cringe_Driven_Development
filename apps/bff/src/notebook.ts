import type { Go } from './go/api.ts';
import type { NotebookContent } from './go/client.ts';

/**
 * Данные страницы блокнота: результат `notebooks.get` и поле `notebookPage` bootstrap. Обёртка
 * `{ notebook }` — чтобы рядом можно было добавить сессию и очередь исполнения.
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
};

/**
 * Общий загрузчик блокнота для HTML и `notebooks.get`: метаданные — из `GET /notebooks/{id}`,
 * согласованные `hash` и ячейки — из одного ответа `GET /notebooks/{id}/content`.
 * @param go вызовы Go от имени сессии
 * @param id ID блокнота
 * @returns данные страницы блокнота
 */
export async function loadNotebook(go: Go, id: number): Promise<NotebookPage> {
    const [meta, content] = await Promise.all([go.getNotebook(id), go.getNotebookContent(id)]);
    return {
        notebook: {
            id: meta.id,
            name: meta.name,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
            hash: content.hash,
            cells: content.cells,
        },
    };
}
