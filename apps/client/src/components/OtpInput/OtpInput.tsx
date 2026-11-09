import { useState } from '@cdd-team/react';
import { clsx } from '@cdd-team/clsx';
import { Icon } from '@components/Icon/Icon';
import { domProps } from '@utils/dom-props';
import styles from './OtpInput.module.css';

/** Число цифр одноразового кода 2FA. */
export const OTP_LENGTH = 6;

/** Индексы ячеек кода */
const CELLS = Array.from({ length: OTP_LENGTH }, (_, index) => index);

/** Свойства {@link OtpInput}. */
interface OtpInputProps {
    /** id первой ячейки: на неё фокус извне; остальные — `${id}-1` … `${id}-5` */
    id: string;
    /** Подпись над ячейками */
    label: string;
    /** Введённые цифры подряд, от 0 до 6 */
    value: string;
    /** Текст ошибки: все ячейки красные, сообщение под полем */
    error?: string;
    disabled?: boolean;
    /** Новое значение при каждом вводе */
    onValueChange: (value: string) => void;
    /** Введена шестая цифра: форма отправляется сама */
    onComplete?: (code: string) => void;
}

const cellId = (id: string, index: number): string => (index === 0 ? id : `${id}-${index}`);

/**
 * Код на момент события: быстрый ввод опережает рендер, и value из прошлого рендера устаревает.
 * Новое value от родителя (сброс, ошибка) заменяет копию; своё же value её не откатывает.
 */
const liveCode = (initial: string) => {
    let code = initial;
    let prop = initial;
    return {
        read(value: string): string {
            if (value !== prop) code = prop = value;
            return code;
        },
        write(next: string): void {
            code = next;
        },
    };
};

const focusCell = (id: string, index: number): void => {
    const cell = document.getElementById(cellId(id, Math.min(index, OTP_LENGTH - 1)));
    if (cell instanceof HTMLInputElement) {
        cell.focus();
        cell.select();
    }
};

/**
 * Поле одноразового кода 2FA (Components → OTP): 6 ячеек по одной цифре, разделитель после
 * третьей. Цифры идут подряд: фокус в пустой ячейке переходит к первой незаполненной. Вставка и
 * автозаполнение раскладывают код по ячейкам, курсор идёт к следующей ячейке, Backspace в пустой —
 * к предыдущей.
 */
export function OtpInput({
    id,
    label,
    value,
    error,
    disabled = false,
    onValueChange,
    onComplete,
}: OtpInputProps) {
    const messageId = `${id}-message`;
    const [live] = useState(liveCode(value));
    const current = (): string => live.read(value);

    /**
     * Новое значение; `end` — позиция после введённых цифр. Отправка — когда ввод дошёл до
     * последней ячейки, в том числе при повторном вводе после ошибки.
     */
    const update = (next: string, end = 0) => {
        live.write(next);
        onValueChange(next);
        if (next.length === OTP_LENGTH && end >= OTP_LENGTH) onComplete?.(next);
    };

    const handleInput = (index: number) => (event: Event) => {
        const input = event.target as HTMLInputElement;
        const code = current();
        /** Набранная цифра — из data: в ячейке без выделения рядом осталась бы прежняя цифра */
        const typed =
            event instanceof InputEvent && event.inputType === 'insertText' ? event.data : null;
        const digits = (typed ?? input.value).replace(/\D/g, '');
        if (digits === '') {
            input.value = input.value === '' ? '' : (code[index] ?? '');
            if (input.value === '' && index < code.length) {
                update(code.slice(0, index) + code.slice(index + 1));
            }
            return;
        }
        const next = (code.slice(0, index) + digits + code.slice(index + digits.length)).slice(
            0,
            OTP_LENGTH,
        );
        input.value = next[index] ?? '';
        update(next, index + digits.length);
        focusCell(id, index + digits.length);
    };

    const handleKeyDown = (index: number) => (event: KeyboardEvent) => {
        const code = current();
        if (event.key === 'Backspace' && index > 0 && (code[index] ?? '') === '') {
            event.preventDefault();
            update(code.slice(0, index - 1));
            focusCell(id, index - 1);
        } else if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault();
            focusCell(id, index - 1);
        } else if (event.key === 'ArrowRight' && index < code.length) {
            event.preventDefault();
            focusCell(id, index + 1);
        }
    };

    /** Ячейки дальше первой пустой не заполняются: цифры кода всегда подряд */
    const handleFocus = (index: number) => (event: Event) => {
        const filled = current().length;
        if (index > filled) focusCell(id, filled);
        else (event.target as HTMLInputElement).select();
    };

    return (
        <fieldset
            className={clsx(styles.otp, error && styles.error)}
            aria-describedby={error ? messageId : undefined}
        >
            <legend key="label" className={styles.label}>
                {label}
            </legend>
            <div key="cells" className={styles.cells}>
                {CELLS.map((index) => [
                    index === OTP_LENGTH / 2 && (
                        <span key="separator" className={styles.separator} aria-hidden="true" />
                    ),
                    <input
                        key={`cell-${index}`}
                        id={cellId(id, index)}
                        className={styles.cell}
                        type="text"
                        value={value[index] ?? ''}
                        disabled={disabled}
                        aria-label={`Цифра ${index + 1} из ${OTP_LENGTH}`}
                        aria-invalid={error ? true : undefined}
                        {...domProps({
                            inputmode: 'numeric',
                            autocomplete: index === 0 ? 'one-time-code' : 'off',
                            pattern: '[0-9]*',
                        })}
                        onInput={handleInput(index)}
                        onKeyDown={handleKeyDown(index)}
                        onFocus={handleFocus(index)}
                    />,
                ])}
            </div>
            {error && (
                <p key="message" id={messageId} className={styles.message}>
                    <Icon key="icon" name="alert" />
                    <span key="text" role="alert">
                        {error}
                    </span>
                </p>
            )}
        </fieldset>
    );
}
