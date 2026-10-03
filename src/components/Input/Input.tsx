import { domProps } from '../../utils/dom-props';
import { Icon } from '../Icon/Icon';
import './Input.css';

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
    /** Текст ошибки: красная граница, иконка и сообщение под полем */
    error?: string;
    /** Состояние Disabled: поле полупрозрачное и не редактируется */
    disabled?: boolean;
    /** Значение атрибута autocomplete */
    autocomplete: string;
    /** id подсказки вне поля, которую скринридер прочитает вместе с ним */
    describedBy?: string;
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
    error,
    disabled = false,
    autocomplete,
    describedBy,
    revealed = false,
    onToggleReveal,
    onValueChange,
    onBlur,
}: InputProps) {
    const isPassword = type === 'password';
    const errorId = `${id}-error`;
    const classes = ['input'];
    if (error) classes.push('input--error');
    if (disabled) classes.push('input--disabled');
    const describedByIds = [error ? errorId : '', describedBy ?? ''].filter(Boolean).join(' ');

    return (
        <div className={classes.join(' ')}>
            <label key="label" className="input__label" htmlFor={id}>
                {label}
            </label>
            <div key="control" className="input__control">
                <input
                    key="input"
                    id={id}
                    className="input__field"
                    type={isPassword && !revealed ? 'password' : 'text'}
                    name={name}
                    value={value}
                    placeholder={placeholder ?? ''}
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedByIds || undefined}
                    {...domProps({
                        autocomplete,
                        autocapitalize: 'none',
                        spellcheck: false,
                    })}
                    onInput={(event) => onValueChange((event.target as HTMLInputElement).value)}
                    onBlur={() => onBlur?.()}
                />
                {isPassword ? (
                    <button
                        key="reveal"
                        className="input__reveal"
                        type="button"
                        disabled={disabled}
                        aria-controls={id}
                        aria-pressed={revealed ? 'true' : 'false'}
                        aria-label="Показать пароль"
                        onClick={() => onToggleReveal?.()}
                    >
                        <Icon name={revealed ? 'eyeSlash' : 'eye'} size={18} />
                    </button>
                ) : null}
            </div>
            {error ? (
                <p key="message" id={errorId} className="input__message" role="alert">
                    <Icon key="icon" name="alert" />
                    <span key="text">{error}</span>
                </p>
            ) : null}
        </div>
    );
}
