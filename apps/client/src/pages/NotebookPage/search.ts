import { useCallback, useLayoutEffect, useMemo, useState } from '@cdd-team/react';
import type { Cell } from '@api/trpc';
import {
    findMatches,
    keepActive,
    sameRange,
    stepActive,
    type SearchRange,
} from '@modules/search/find';
import type { SourceMark } from '@modules/search/marks';
import { CURRENT_SELECTOR } from '@modules/search/Marked';

/** id кнопки «Поиск»: на неё возвращается фокус после закрытия панели. */
export const SEARCH_BUTTON_ID = 'notebook-search-button';

const NO_MATCHES: SearchRange[] = [];
const NO_MARKS: readonly SourceMark[] = [];

/** Состояние поиска по блокноту и действия с ним. */
export interface NotebookSearch {
    open: boolean;
    query: string;
    matches: SearchRange[];
    active: SearchRange | null;
    /** Растёт, когда нужно прокрутить к активному вхождению: при переходе и новом запросе */
    jump: number;
    /** Вхождения в ячейке для подсветки; пусто без совпадений и при закрытом поиске */
    marksOf: (cellId: string) => readonly SourceMark[];
    show: () => void;
    close: () => void;
    setQuery: (query: string) => void;
    next: () => void;
    prev: () => void;
}

/**
 * Поиск по текущим исходникам ячеек: черновик важнее source, даже пустой. Пересчёт при правках
 * сохраняет активное вхождение, если оно осталось, и сам не прокручивает страницу.
 * @param cells ячейки блокнота по порядку
 * @param drafts черновики по id ячейки
 * @param enabled поиск доступен: блокнот загружен и это не тач-устройство
 * @returns состояние и действия поиска
 */
export function useNotebookSearch(
    cells: readonly Cell[],
    drafts: Record<string, string>,
    enabled: boolean,
): NotebookSearch {
    const [open, setOpen] = useState(false);
    const [query, setQueryText] = useState('');
    const [chosen, setChosen] = useState<SearchRange | null>(null);
    const [jump, setJump] = useState(0);

    const matches = useMemo(
        () =>
            open && enabled && query
                ? findMatches(
                      cells.map((cell) => ({ id: cell.id, text: drafts[cell.id] ?? cell.source })),
                      query,
                  )
                : NO_MATCHES,
        [open, enabled, query, cells, drafts],
    );
    const active = keepActive(matches, chosen);

    // Вхождение пропало после правки — активным остаётся первое, а не возвращается прежнее
    useLayoutEffect(() => {
        if (!sameRange(active, chosen)) setChosen(active);
    }, [active, chosen]);

    const close = useCallback(() => {
        setOpen(false);
        setQueryText('');
        setChosen(null);
    }, []);

    useLayoutEffect(() => {
        if (!enabled) close();
    }, [enabled, close]);

    const marks = useMemo(() => {
        const byCell = new Map<string, SourceMark[]>();
        for (const range of matches) {
            const list = byCell.get(range.cellId) ?? [];
            list.push({ from: range.from, to: range.to, current: sameRange(range, active) });
            byCell.set(range.cellId, list);
        }
        return byCell;
    }, [matches, active]);

    const step = (direction: 1 | -1) => {
        setChosen(stepActive(matches, active, direction));
        setJump((count) => count + 1);
    };

    return {
        open,
        query,
        matches,
        active,
        jump,
        marksOf: (cellId) => marks.get(cellId) ?? NO_MARKS,
        show: useCallback(() => setOpen(true), []),
        close,
        setQuery: (text) => {
            setQueryText(text);
            setChosen(null);
            setJump((count) => count + 1);
        },
        next: () => step(1),
        prev: () => step(-1),
    };
}

// Запас до края поля кода, чтобы совпадение не прилипало к границе
const EDGE = 32;

/**
 * Прокручивает к активному вхождению. В длинной строке кода сдвигается само поле по горизонтали,
 * а не страница; по вертикали — страница, с отступом под прилипшую шапку (`--search-margin`).
 * @param root где искать активное вхождение
 */
export function scrollToCurrent(root: ParentNode): void {
    const mark = root.querySelector<HTMLElement>(CURRENT_SELECTOR);
    if (!mark) return;
    // слой подсветки кода — <pre> под полем: координаты метки — те же, что у текста поля
    const editor = mark.closest('pre')?.nextElementSibling;
    if (editor instanceof HTMLTextAreaElement && editor.scrollWidth > editor.clientWidth) {
        const left = mark.offsetLeft;
        const right = left + mark.offsetWidth;
        if (left < editor.scrollLeft + EDGE) editor.scrollLeft = Math.max(0, left - EDGE);
        else if (right > editor.scrollLeft + editor.clientWidth - EDGE)
            editor.scrollLeft = right - editor.clientWidth + EDGE;
        // подсветка сдвигается по событию scroll поля: сразу, до прокрутки страницы
        editor.dispatchEvent(new Event('scroll'));
    }
    mark.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
