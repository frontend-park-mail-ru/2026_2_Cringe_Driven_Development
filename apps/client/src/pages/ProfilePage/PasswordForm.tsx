import { useEffect, useState } from '@cdd-team/react';

import { isRpcError } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Input } from '@components/Input/Input';
import { clsx } from '@cdd-team/clsx';
import { useNavigate } from '@cdd-team/router';
import { changePassword } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import {
    passwordRules,
    validateConfirm,
    validateNewPassword,
    validatePassword,
} from '@utils/credentials';
import styles from './ProfilePage.module.css';

const EMPTY = { current: '', next: '', confirm: '' };
const HIDDEN = { current: false, next: false, confirm: false };
const fieldId = (field: Field) => `profile-password-${field}`;

type Field = keyof typeof EMPTY;

/**
 * Раздел «Смена пароля». Кнопка активна, когда заполнены все поля. Неверный текущий пароль —
 * ошибка под его полем, новый пароль и повтор остаются. После успеха Go отзывает все сессии:
 * пользователь становится гостем и входит заново с новым паролем.
 * @returns раздел с формой
 */
export function PasswordForm() {
    const [values, setValues] = useState(EMPTY);
    const [revealed, setRevealed] = useState(HIDDEN);
    const [submitted, setSubmitted] = useState(false);
    const [wrongCurrent, setWrongCurrent] = useState(false);
    const [rejectedNext, setRejectedNext] = useState<string | undefined>(undefined);
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [focusRequest, setFocusRequest] = useState<{ field: Field } | null>(null);
    const [life] = useState({ alive: true });

    // после снятия pending: отключённое поле фокус не принимает
    useEffect(() => {
        if (focusRequest) document.getElementById(fieldId(focusRequest.field))?.focus();
    }, [focusRequest]);

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    const validation: Partial<Record<Field, string>> = {
        current: validatePassword(values.current),
        next: validateNewPassword(values.current, values.next),
        confirm: validateConfirm(values.next, values.confirm),
    };
    const errorOf = (field: Field) => (submitted ? validation[field] : undefined);

    const send = async () => {
        setPending(true);
        hideSnackbar();
        try {
            await changePassword({
                current_password: values.current,
                new_password: values.next,
            });
            showToast('Пароль изменён. Войдите с новым паролем');
            navigate({ to: '/login', replace: true });
            return;
        } catch (error) {
            if (!life.alive) return;
            setPending(false);
            const code = isRpcError(error) ? error.data?.appCode : undefined;
            if (code === 'invalid_current_password') {
                setWrongCurrent(true);
                setFocusRequest({ field: 'current' });
            } else if (code === 'validation_error') {
                setRejectedNext('Новый пароль не подходит');
                setFocusRequest({ field: 'next' });
            } else {
                // Результат неизвестен: контракт запрещает повторять запрос автоматически
                showSnackbar('Не удалось изменить пароль. Проверьте, какой пароль действует');
            }
        }
    };

    const filled = Boolean(values.current && values.next && values.confirm);

    const handleSubmit = (event: Event) => {
        event.preventDefault();
        if (pending || !filled) return;
        setSubmitted(true);
        const invalid = (['current', 'next', 'confirm'] as const).find(
            (field) => validation[field],
        );
        if (invalid) {
            document.getElementById(fieldId(invalid))?.focus();
            return;
        }
        void send();
    };

    const input = (field: Field, label: string, placeholder: string, autocomplete: string) => (
        <Input
            key={field}
            id={fieldId(field)}
            label={label}
            type="password"
            name={field}
            value={values[field]}
            placeholder={placeholder}
            error={
                field === 'current' && wrongCurrent
                    ? 'Неверный текущий пароль'
                    : ((field === 'next' ? rejectedNext : undefined) ?? errorOf(field))
            }
            disabled={pending}
            autocomplete={autocomplete}
            revealed={revealed[field]}
            onToggleReveal={() =>
                setRevealed((current) => ({ ...current, [field]: !current[field] }))
            }
            onValueChange={(value) => {
                setValues((current) => ({ ...current, [field]: value }));
                if (field === 'current') setWrongCurrent(false);
                if (field === 'next') setRejectedNext(undefined);
                hideSnackbar();
            }}
        />
    );

    return (
        <form className={styles.section} noValidate onSubmit={handleSubmit}>
            <h2 key="title" className={styles.sectionTitle}>
                Смена пароля
            </h2>
            <div key="fields" className={styles.fields}>
                {input('current', 'Текущий пароль', 'Введите текущий пароль', 'current-password')}
                {input('next', 'Новый пароль', 'Придумайте новый пароль', 'new-password')}
                {input('confirm', 'Повторите новый пароль', 'Ещё раз новый пароль', 'new-password')}
            </div>
            <div key="rules" className={styles.rules}>
                <p key="caption">Требования к паролю:</p>
                <ul key="list" className={styles.ruleList}>
                    {passwordRules(values.current, values.next, values.confirm).map((rule) => (
                        <li
                            key={rule.text}
                            className={clsx(styles.rule, rule.met && styles.ruleMet)}
                        >
                            <Icon key="icon" name={rule.met ? 'check' : 'dot'} />
                            <span key="text" className={styles.ruleText}>
                                {rule.text}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            <Button key="save" type="submit" loading={pending} disabled={!filled}>
                Изменить пароль
            </Button>
        </form>
    );
}
