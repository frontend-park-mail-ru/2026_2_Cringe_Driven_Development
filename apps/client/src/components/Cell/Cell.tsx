import { useLayoutEffect, useState, type ReactNode } from '@cdd-team/react';
import type { Cell as CellData } from '@api/trpc';
import { Icon } from '@components/Icon/Icon';
import { IconButton } from '@components/IconButton/IconButton';
import { Markdown } from '@modules/markdown/Markdown';
import { clsx } from '@cdd-team/clsx';
import styles from './Cell.module.css';

// Высота редактора по содержимому: своей вертикальной прокрутки у него нет, прокручивается страница
function fitHeight(element: HTMLElement): void {
    // Пока высота 'auto', страница не должна укорачиваться: браузер обрезал бы прокрутку, и экран
    // прыгал бы на каждый ввод
    const parent = element.parentElement;
    if (parent) parent.style.minHeight = `${parent.offsetHeight}px`;
    element.style.height = 'auto';
    // полоса горизонтальной прокрутки кода не должна закрывать последнюю строку
    const scrollbar = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + scrollbar}px`;
    if (parent) parent.style.minHeight = '';
}

const editorOf = (id: string): HTMLTextAreaElement | null => {
    const element = document.getElementById(cellEditorId(id));
    return element instanceof HTMLTextAreaElement ? element : null;
};

/** Режим Markdown-ячейки; refocus — перевести фокус в новый режим после отрисовки */
interface Mode {
    value: 'view' | 'edit';
    refocus: boolean;
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
    /** Ячейка только что создана: Markdown сразу открывается для ввода */
    startEditing?: boolean;
    /** Тач-устройство: только просмотр, без редактирования и структурных действий */
    readOnly?: boolean;
    onInput: (text: string, composing: boolean) => void;
    /** Вставка из буфера обмена: страница может заменить её помещающейся частью */
    onPaste: (event: ClipboardEvent) => void;
    /** Выход из редактора или конец IME — сохранить сразу */
    onCommit: () => void;
    onFocus: () => void;
    /** Фокус ушёл из ячейки: клик вне ячеек, Tab или Escape */
    onLeave: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
    /** Левая колонка кодовой ячейки: запуск и счётчик */
    gutter?: ReactNode;
    /** Под редактором: вывод и ошибки */
    below?: ReactNode;
}

/**
 * Ячейка блокнота (Components → Cell): редактор исходника и кнопки перемещения и удаления.
 * Исходник — обычный текст в textarea: растёт по содержимому, длинная строка кода прокручивается
 * внутри редактора, Markdown переносится. Markdown-ячейка вне редактирования показывает просмотр:
 * двойной клик или Enter открывают исходник, Shift+Enter, Esc и уход фокуса возвращают просмотр.
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
    startEditing = false,
    readOnly = false,
    onInput,
    onPaste,
    onCommit,
    onFocus,
    onLeave,
    onMoveUp,
    onMoveDown,
    onDelete,
    gutter,
    below,
}: CellProps) {
    const isCode = cell.kind === 'code';
    const placeholder = isCode ? '# Код на Python' : 'Заголовок или описание — Markdown';
    const [mode, setMode] = useState<Mode>({
        value: startEditing ? 'edit' : 'view',
        refocus: startEditing,
    });
    // Больше лимита исходник не прячется за просмотром
    const editing = !readOnly && (isCode || mode.value === 'edit' || tooLarge);
    const hintId = `${cellEditorId(cell.id)}-hint`;

    useLayoutEffect(() => {
        if (startEditing) setMode({ value: 'edit', refocus: true });
    }, [startEditing]);

    // Устройство стало тачем посреди ввода: черновик сохраняет страница, ячейка — в просмотр
    useLayoutEffect(() => {
        if (readOnly) setMode({ value: 'view', refocus: false });
    }, [readOnly]);

    useLayoutEffect(() => {
        if (!mode.refocus) return;
        const element = document.getElementById(cellEditorId(cell.id));
        if (!element) return;
        element.focus();
        if (element instanceof HTMLTextAreaElement)
            element.setSelectionRange(element.value.length, element.value.length);
    }, [mode, cell.id]);

    // наблюдатель ширины — один на редактор, не на каждый ввод
    useLayoutEffect(() => {
        const element = editorOf(cell.id);
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
    }, [cell.id, editing]);

    useLayoutEffect(() => {
        const element = editorOf(cell.id);
        if (element) fitHeight(element);
    }, [text, cell.id, editing]);

    const edit = () => {
        if (!readOnly) setMode({ value: 'edit', refocus: true });
    };

    return (
        // Нажатие на любое место ячейки, кроме кнопок и ссылок, выбирает её: фокус — в редактор
        // или просмотр, не уходя из ячейки. Это удобство для мыши: с клавиатуры редактор, просмотр
        // и кнопки и так достижимы по Tab
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
            className={clsx(
                styles.cell,
                isCode && styles.code,
                selected && styles.selected,
                tooLarge && styles.tooLarge,
            )}
            onMouseDown={(event) => {
                if (readOnly) return;
                if ((event.target as Element).closest('button:enabled, textarea, a')) return;
                event.preventDefault();
                document.getElementById(cellEditorId(cell.id))?.focus();
            }}
            onBlurCapture={(event) => {
                const next = event.relatedTarget as Node | null;
                // удалённая ячейка: куда перейти, решает страница
                if (!(event.target as Node).isConnected) return;
                if (next && (event.currentTarget as Node).contains(next)) return;
                if (mode.value === 'edit' && !tooLarge) setMode({ value: 'view', refocus: false });
                onLeave();
            }}
        >
            <div key="gutter" className={styles.gutter}>
                {isCode ? gutter : <span className={styles.kind}>Aa</span>}
            </div>
            <div key="body" className={styles.body}>
                {readOnly && isCode ? (
                    <pre
                        key="static"
                        id={cellEditorId(cell.id)}
                        className={styles.static}
                        // прокручивается по горизонтали — с клавиатуры тоже
                        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                        tabIndex={0}
                        aria-label="Код ячейки"
                    >
                        {text || (
                            <span key="empty" className={styles.empty}>
                                {placeholder}
                            </span>
                        )}
                    </pre>
                ) : editing ? (
                    <textarea
                        key="editor"
                        id={cellEditorId(cell.id)}
                        className={styles.editor}
                        value={text}
                        placeholder={placeholder}
                        rows={1}
                        wrap={isCode ? 'off' : 'soft'}
                        aria-label={isCode ? 'Код ячейки' : 'Текст ячейки'}
                        aria-describedby={isCode ? undefined : hintId}
                        aria-invalid={tooLarge}
                        onFocus={() => {
                            // исходник больше лимита виден и без режима: фокус в нём — редактирование
                            if (!isCode && mode.value !== 'edit')
                                setMode({ value: 'edit', refocus: false });
                            onFocus();
                        }}
                        onBlur={onCommit}
                        onPaste={onPaste}
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
                            if (isCode) {
                                if (event.key === 'Escape')
                                    (event.target as HTMLTextAreaElement).blur();
                                return;
                            }
                            if (event.isComposing) return;
                            const leave =
                                event.key === 'Escape' || (event.key === 'Enter' && event.shiftKey);
                            if (!leave) return;
                            event.preventDefault();
                            onCommit();
                            if (!tooLarge) setMode({ value: 'view', refocus: true });
                        }}
                    />
                ) : (
                    <div
                        key="preview"
                        id={cellEditorId(cell.id)}
                        className={styles.preview}
                        tabIndex={0}
                        // поле только для чтения: содержимое читается, Enter открывает исходник.
                        // textarea не годится — в ней нет отформатированного Markdown
                        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                        role="textbox"
                        aria-readonly="true"
                        aria-multiline="true"
                        aria-label="Текст ячейки"
                        aria-describedby={readOnly ? undefined : hintId}
                        onFocus={onFocus}
                        onDoubleClick={edit}
                        onKeyDown={(event) => {
                            // Enter на ссылке внутри просмотра открывает ссылку
                            if (event.target !== event.currentTarget) return;
                            if (event.key !== 'Enter' || event.shiftKey) return;
                            if (event.ctrlKey || event.altKey || event.metaKey) return;
                            event.preventDefault();
                            edit();
                        }}
                    >
                        {text ? (
                            <Markdown key="markdown" source={text} />
                        ) : (
                            <span key="empty" className={styles.empty}>
                                {placeholder}
                            </span>
                        )}
                    </div>
                )}
                {!isCode && !readOnly && (
                    <span key="hint" id={hintId} className={styles.hint}>
                        {editing
                            ? 'Shift+Enter или Esc — показать результат'
                            : 'Enter или двойной клик — редактировать'}
                    </span>
                )}
                {tooLarge && (
                    <p key="error" className={styles.error} role="alert">
                        <Icon key="icon" name="alert" />
                        Превышен размер ячейки — максимум 64 КиБ
                    </p>
                )}
                {below}
            </div>
            {!readOnly && (
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
            )}
        </div>
    );
}

/**
 * Id редактора ячейки или её просмотра: в него страница переводит фокус после создания.
 * @param id id ячейки внутри блокнота
 * @returns id textarea или просмотра Markdown
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
