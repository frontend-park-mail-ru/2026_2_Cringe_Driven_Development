import type { Cell } from '@api/trpc';

/**
 * Открыт ли редактор ячейки. Код редактируется всегда, Markdown — в режиме правки или
 * когда исходник больше лимита, raw — никогда: показывается буквальным текстом.
 * @param kind вид ячейки
 * @param state только просмотр, режим правки Markdown, исходник больше лимита
 * @returns редактор открыт
 */
export function isEditing(
    kind: Cell['kind'],
    state: { readOnly: boolean; edit: boolean; tooLarge: boolean },
): boolean {
    if (state.readOnly || kind === 'raw') return false;
    return kind === 'code' || state.edit || state.tooLarge;
}
