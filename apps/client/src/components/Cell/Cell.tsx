import { useLayoutEffect, type ReactNode } from '@cdd-team/react';
import type { Cell as CellData } from '@api/trpc';
import { Icon } from '@components/Icon/Icon';
import { IconButton } from '@components/IconButton/IconButton';
import { clsx } from '@cdd-team/clsx';
import styles from './Cell.module.css';

// Высота редактора по содержимому: своей вертикальной прокрутки у него нет, прокручивается страница
function fitHeight(element: HTMLElement): void {
    element.style.height = 'auto';
    // полоса горизонтальной прокрутки кода не должна закрывать последнюю строку
    const scrollbar = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + scrollbar}px`;
}

/** Свойства {@link Cell}. */
interface CellProps {
    cell: CellData;
    /** Текст в редакторе: черновик или подтверждённый source */
    text: string;
    /** В ячейке фокус ввода */
    selected: boolean;
    /** Исходник больше лимита: не сохраняется */
    tooLarge: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** Структурные действия недоступны: идёт операция или не разрешён конфликт */
    locked: boolean;
    onInput: (text: string, composing: boolean) => void;
    /** Выход из редактора или конец IME — сохранить сразу */
    onCommit: () => void;
    onFocus: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
    /** Левая колонка кодовой ячейки: запуск и счётчик (#51) */
    gutter?: ReactNode;
    /** Под редактором: вывод и ошибки (#51) */
    below?: ReactNode;
}

/**
 * Ячейка блокнота (Components → Cell): редактор исходника и кнопки перемещения и удаления.
 * Исходник — обычный текст в textarea: растёт по содержимому, длинная строка кода прокручивается
 * внутри редактора, Markdown переносится.
 * @param props свойства ячейки
 * @returns ячейка
 */
export function Cell({
    cell,
    text,
    selected,
    tooLarge,
    canMoveUp,
    canMoveDown,
    locked,
    onInput,
    onCommit,
    onFocus,
    onMoveUp,
    onMoveDown,
    onDelete,
    gutter,
    below,
}: CellProps) {
    const isCode = cell.kind === 'code';
    const placeholder = isCode ? '# Код на Python' : 'Заголовок или описание — Markdown';

    // наблюдатель ширины — один на ячейку, не на каждый ввод
    useLayoutEffect(() => {
        const element = document.getElementById(cellEditorId(cell.id));
        if (!element) return;
        // проверка орфографии подчёркивала бы код; атрибута в типах JSX нет
        element.spellcheck = false;
        // высоту меняет сам fitHeight: пересчёт нужен только при смене ширины
        let width = element.clientWidth;
        const observer = new ResizeObserver(() => {
            if (element.clientWidth === width) return;
            width = element.clientWidth;
            fitHeight(element);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [cell.id]);

    useLayoutEffect(() => {
        const element = document.getElementById(cellEditorId(cell.id));
        if (element) fitHeight(element);
    }, [text, cell.id]);

    return (
        <div
            className={clsx(
                styles.cell,
                isCode && styles.code,
                selected && styles.selected,
                tooLarge && styles.tooLarge,
            )}
        >
            <div key="gutter" className={styles.gutter}>
                {isCode ? gutter : <span className={styles.kind}>Aa</span>}
            </div>
            <div key="body" className={styles.body}>
                <textarea
                    key="editor"
                    id={cellEditorId(cell.id)}
                    className={styles.editor}
                    value={text}
                    placeholder={placeholder}
                    rows={1}
                    wrap={isCode ? 'off' : 'soft'}
                    aria-label={isCode ? 'Код ячейки' : 'Текст ячейки'}
                    aria-invalid={tooLarge}
                    onFocus={onFocus}
                    onBlur={onCommit}
                    onInput={(event) =>
                        onInput(
                            (event.target as HTMLTextAreaElement).value,
                            (event as InputEvent).isComposing,
                        )
                    }
                    onCompositionEnd={(event) => {
                        onInput((event.target as HTMLTextAreaElement).value, false);
                        onCommit();
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') (event.target as HTMLTextAreaElement).blur();
                    }}
                />
                {tooLarge && (
                    <p key="error" className={styles.error} role="alert">
                        <Icon key="icon" name="alert" />
                        Превышен размер ячейки — максимум 64 КиБ
                    </p>
                )}
                {below}
            </div>
            <div key="actions" className={styles.actions}>
                <IconButton
                    key="up"
                    icon="up"
                    label="Переместить ячейку выше"
                    className={styles.action}
                    disabled={locked || !canMoveUp}
                    onClick={onMoveUp}
                />
                <IconButton
                    key="down"
                    icon="down"
                    label="Переместить ячейку ниже"
                    className={styles.action}
                    disabled={locked || !canMoveDown}
                    onClick={onMoveDown}
                />
                <IconButton
                    key="delete"
                    icon="trash"
                    label="Удалить ячейку"
                    className={clsx(styles.action, styles.delete)}
                    disabled={locked}
                    onClick={onDelete}
                />
            </div>
        </div>
    );
}

/**
 * Id редактора ячейки: в него страница переводит фокус после создания.
 * @param id id ячейки внутри блокнота
 * @returns id textarea
 */
export function cellEditorId(id: string): string {
    return `cell-editor-${id}`;
}

/**
 * Ячейка-скелетон, пока блокнот загружается.
 * @returns скелетон ячейки
 */
export function CellSkeleton() {
    return (
        <div className={clsx(styles.cell, styles.skeleton)} aria-hidden="true">
            <span key="line-1" className={styles.bar} style={{ width: '420px' }} />
            <span key="line-2" className={styles.bar} style={{ width: '280px' }} />
        </div>
    );
}
