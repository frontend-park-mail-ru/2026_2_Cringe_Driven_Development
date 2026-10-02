import { Icon } from '../Icon/Icon';
import './PasswordRule.css';

/** Состояние требования: ещё не проверялось, выполнено, не выполнено. */
export type RuleState = 'neutral' | 'met' | 'unmet';

const ICONS = { neutral: 'dot', met: 'check', unmet: 'cross' } as const;
const STATUS = { neutral: '', met: 'выполнено', unmet: 'не выполнено' } as const;

/** Свойства {@link PasswordRule}. */
interface PasswordRuleProps {
    /** id строки: на него ссылается поле пароля через describedBy */
    id: string;
    /** Текст требования */
    label: string;
    state: RuleState;
}

/**
 * Требование к паролю (Components → PasswordRule). Цвет всегда дублируется иконкой,
 * а для скринридера — словами «выполнено» / «не выполнено».
 * @param props свойства требования
 * @returns строка требования
 */
export function PasswordRule({ id, label, state }: PasswordRuleProps) {
    return (
        <p id={id} className={`password-rule password-rule--${state}`}>
            <Icon key="icon" name={ICONS[state]} />
            <span key="label">{label}</span>
            {state === 'neutral' ? null : (
                <span key="status" className="visually-hidden">
                    {`: ${STATUS[state]}`}
                </span>
            )}
        </p>
    );
}
