import { useEffect, useRef } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import { IconButton } from '@components/IconButton/IconButton';
import { domProps } from '@utils/dom-props';
import styles from './SearchBar.module.css';

/** id поля запроса: в него переводят фокус кнопка «Поиск» и Ctrl/Cmd+F. */
export const SEARCH_INPUT_ID = 'notebook-search';

/** id панели поиска: на неё ссылается aria-controls кнопки «Поиск». */
export const SEARCH_PANEL_ID = 'notebook-search-panel';

/** Свойства {@link SearchBar}. */
interface SearchBarProps {
    query: string;
    /** Номер активного вхождения с 1; 0 — активного нет */
    current: number;
    /** Сколько всего вхождений */
    total: number;
    onQuery: (query: string) => void;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
}

// После нажатия кнопки панели ввод продолжается в поле
const focusInput = (): void => document.getElementById(SEARCH_INPUT_ID)?.focus();

/**
 * Панель поиска по блокноту (Components → SearchBar): поле со счётчиком и очисткой, переходы и
 * закрытие. Enter и Shift+Enter в поле — следующее и предыдущее совпадение, Esc в панели закрывает.
 * @param props запрос, счётчик и действия
 * @returns панель
 */
export function SearchBar({
    query,
    current,
    total,
    onQuery,
    onNext,
    onPrev,
    onClose,
}: SearchBarProps) {
    // Esc закрывает панель из поля и с её кнопок
    const barRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing) return;
            event.preventDefault();
            onClose();
        };
        bar.addEventListener('keydown', handleKey);
        return () => bar.removeEventListener('keydown', handleKey);
    }, [onClose]);
    const status = !query ? '' : total > 0 ? `${current} из ${total}` : 'Ничего не найдено';
    return (
        <search ref={barRef} id={SEARCH_PANEL_ID} className={styles.bar}>
            <div key="field" className={styles.field}>
                <Icon key="icon" name="search" className={styles.icon} />
                <input
                    key="input"
                    id={SEARCH_INPUT_ID}
                    className={styles.input}
                    type="text"
                    value={query}
                    placeholder="Поиск по блокноту"
                    aria-label="Поиск по блокноту"
                    {...domProps({ autocomplete: 'off', spellcheck: false })}
                    onInput={(event) => onQuery((event.target as HTMLInputElement).value)}
                    onKeyDown={(event) => {
                        // Enter подтверждает ввод IME; Safari отдаёт его с keyCode 229
                        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229)
                            return;
                        event.preventDefault();
                        if (event.shiftKey) onPrev();
                        else onNext();
                    }}
                />
                <span key="status" className={styles.count} aria-live="polite">
                    {status}
                </span>
                {query && (
                    <button
                        key="clear"
                        className={styles.clear}
                        type="button"
                        aria-label="Очистить запрос"
                        onClick={() => {
                            onQuery('');
                            focusInput();
                        }}
                    >
                        <Icon name="close" size={12} />
                    </button>
                )}
            </div>
            <IconButton
                key="prev"
                icon="up"
                label="Предыдущее совпадение"
                disabled={total === 0}
                onClick={() => {
                    onPrev();
                    focusInput();
                }}
            />
            <IconButton
                key="next"
                icon="down"
                label="Следующее совпадение"
                disabled={total === 0}
                onClick={() => {
                    onNext();
                    focusInput();
                }}
            />
            <IconButton key="close" icon="close" label="Закрыть поиск" onClick={onClose} />
        </search>
    );
}
