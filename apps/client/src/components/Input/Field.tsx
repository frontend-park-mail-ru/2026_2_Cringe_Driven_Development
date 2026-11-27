import { clsx } from '@cdd-team/clsx';
import type { ReactNode } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import styles from './Input.module.css';

/** Общие свойства полей {@link Textarea} и {@link Select}. */
export interface FieldProps {
    /** id контрола: к нему привязаны подпись и сообщение под полем */
    id: string;
    /** Подпись над полем */
    label: string;
    /** Имя поля в форме */
    name: string;
    value: string;
    /** Подсказка под полем; ошибка показывается вместо неё */
    hint?: string;
    /** Текст ошибки: красная граница, иконка и сообщение под полем */
    error?: string;
    /** Ошибка без своего сообщения: красная граница, строка под полем пустая */
    invalid?: boolean;
    /** Состояние Disabled: поле полупрозрачное и не редактируется */
    disabled?: boolean;
    /** Строка под полем есть, даже пустая (по умолчанию): форма не прыгает при валидации */
    reserveMessage?: boolean;
    /** Новое значение при каждом изменении */
    onValueChange: (value: string) => void;
    /** Поле потеряло фокус */
    onBlur?: () => void;
}

/**
 * ARIA-атрибуты контрола поля: ошибка и подсказка под полем.
 * @returns `aria-invalid` и `aria-describedby` для spread в контрол
 */
export function fieldAria({ id, hint, error, invalid = false }: FieldProps) {
    return {
        'aria-invalid': error || invalid ? true : undefined,
        'aria-describedby': error || (hint && !invalid) ? `${id}-message` : undefined,
    };
}

/** Обёртка поля в оформлении {@link Input}: подпись, контрол и строка подсказки или ошибки. */
export function Field({
    field,
    multiline = false,
    children,
}: {
    /** Свойства поля */
    field: FieldProps;
    /** Многострочный контрол: высота по содержимому */
    multiline?: boolean;
    /** Сам контрол */
    children: ReactNode;
}) {
    const { id, label, hint, error, invalid = false, disabled = false } = field;
    const { reserveMessage = true } = field;
    return (
        <div
            className={clsx(
                styles.input,
                (error || invalid) && styles.error,
                disabled && styles.disabled,
            )}
        >
            <label key="label" className={styles.label} htmlFor={id}>
                {label}
            </label>
            <div key="control" className={clsx(styles.control, multiline && styles.multiline)}>
                {children}
            </div>
            {(reserveMessage || error || hint) && (
                <p key="message" id={`${id}-message`} className={styles.message}>
                    {error && <Icon key="icon" name="alert" />}
                    {error ? (
                        <span key="error" className={styles.messageText} role="alert">
                            {error}
                        </span>
                    ) : (
                        <span key="hint" className={styles.messageText}>
                            {invalid ? '' : (hint ?? '')}
                        </span>
                    )}
                </p>
            )}
        </div>
    );
}
