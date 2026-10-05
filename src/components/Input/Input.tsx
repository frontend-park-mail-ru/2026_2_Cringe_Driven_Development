import { clsx } from '@modules/clsx';
import { domProps } from '@utils/dom-props';
import { Icon } from '@components/Icon/Icon';
import styles from './Input.module.css';

/** Свойства {@link Input}. */
interface InputProps {
    /** id поля: к нему привязаны подпись, сообщение об ошибке и фокус извне */
    id: string;
    /** Подпись над полем */
    label: string;
    /** Text — обычное поле, Password — с кнопкой показа пароля */
    type?: 'text' | 'password';
    /** Имя поля в форме */
    name: string;
    /** Текущее значение. */
    value: string;
    /** Подсказка внутри пустого поля */
    placeholder?: string;
    /** Подсказка под полем; ошибка показывается вместо неё */
    hint?: string;
    /** Текст ошибки: красная граница, иконка и сообщение под полем */
    error?: string;
    /** Состояние Disabled: поле полупрозрачное и не редактируется */
    disabled?: boolean;
    /** Значение атрибута autocomplete */
    autocomplete: string;
    /** Только для Password: пароль показан открытым текстом */
    revealed?: boolean;
    /** Только для Password: нажатие на «глаз» */
    onToggleReveal?: () => void;
    /** Новое значение при каждом вводе */
    onValueChange: (value: string) => void;
    /** Поле потеряло фокус */
    onBlur?: () => void;
}

/**
 * Поле ввода из макета (Components → Input).
 * Под полем всегда есть строка под подсказку или ошибку, поэтому форма не прыгает при валидации.
 * @param props свойства поля
 * @returns разметка поля
 */
export function Input({
    id,
    label,
    type = 'text',
    name,
    value,
    placeholder,
    hint,
    error,
    disabled = false,
    autocomplete,
    revealed = false,
    onToggleReveal,
    onValueChange,
    onBlur,
}: InputProps) {
    const isPassword = type === 'password';
    const messageId = `${id}-message`;

    return (
        <div className={clsx(styles.input, error && styles.error, disabled && styles.disabled)}>
            <label key="label" className={styles.label} htmlFor={id}>
                {label}
            </label>
            <div key="control" className={styles.control}>
                <input
                    key="input"
                    id={id}
                    className={styles.field}
                    type={isPassword && !revealed ? 'password' : 'text'}
                    name={name}
                    value={value}
                    placeholder={placeholder ?? ''}
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error || hint ? messageId : undefined}
                    {...domProps({
                        autocomplete,
                        autocapitalize: 'none',
                        spellcheck: false,
                    })}
                    onInput={(event) => onValueChange((event.target as HTMLInputElement).value)}
                    onBlur={() => onBlur?.()}
                />
                {isPassword && (
                    <button
                        key="reveal"
                        className={styles.reveal}
                        type="button"
                        disabled={disabled}
                        aria-controls={id}
                        aria-pressed={revealed ? 'true' : 'false'}
                        aria-label="Показать пароль"
                        onClick={() => onToggleReveal?.()}
                    >
                        <Icon name={revealed ? 'eyeSlash' : 'eye'} size={18} />
                    </button>
                )}
            </div>
            <p key="message" id={messageId} className={styles.message}>
                {error && <Icon key="icon" name="alert" />}
                {error ? (
                    <span key="error" className={styles.messageText} role="alert">
                        {error}
                    </span>
                ) : (
                    <span key="hint" className={styles.messageText}>
                        {hint ?? ''}
                    </span>
                )}
            </p>
        </div>
    );
}
