import type { Go } from './go/api.ts';
import type { NotebookContent } from './go/client.ts';

/** Ячейка блокнота из content: у code — сохранённые результаты исполнения. */
export type ContentCell = NotebookContent['cells'][number];

/** Данные страницы блокнота: результат `notebooks.get` и поле `notebookPage` bootstrap. */
export type NotebookPage = {
    notebook: {
        id: number;
        name: string;
        created_at: string;
        updated_at: string;
        hash: string;
        cells: ContentCell[];
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
