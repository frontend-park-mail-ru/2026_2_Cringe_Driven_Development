import { useEffect, useState } from '@cdd-team/react';

import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { useNavigate } from '@cdd-team/router';
import { login, register } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import {
    authErrorMessage,
    LOGIN_RULE,
    PASSWORD_RULE,
    validateConfirm,
    validateLogin,
    validatePassword,
    validateTotp,
    type AuthMode,
} from '@utils/credentials';
import styles from './AuthPage.module.css';

type Field = 'login' | 'password' | 'confirm' | 'code';
type FieldTexts = Partial<Record<Field, string>>;

const EMPTY = { login: '', password: '', confirm: '', code: '' };
const NOT_TOUCHED = { login: false, password: false, confirm: false, code: false };

/** Свойства {@link AuthForm}. */
interface AuthFormProps {
    mode: AuthMode;
}

/**
 * Форма входа или регистрации.
 * Ошибки полей видны после первой отправки или после ухода из заполненного поля.
 * Ошибки сервера и сети — в снекбаре: «Повторить» отправляет форму ещё раз.
 * Если у аккаунта включена 2FA, после верного пароля появляется поле TOTP-кода.
 * @param props свойства формы
 * @returns форма
 */
export function AuthForm({ mode }: AuthFormProps) {
    const isRegister = mode === 'register';
    const navigate = useNavigate();

    const [values, setValues] = useState(EMPTY);
    const [touched, setTouched] = useState(NOT_TOUCHED);
    const [submitted, setSubmitted] = useState(false);
    const [pending, setPending] = useState(false);
    const [serverErrors, setServerErrors] = useState<FieldTexts>({});
    // Сервер не сказал, что неверно, — подсвечиваем и логин, сообщение только под паролем
    const [credentialsRejected, setCredentialsRejected] = useState(false);
    // Go ответил two_factor_required: следующий вход — с кодом
    const [twoFactor, setTwoFactor] = useState(false);
    const [revealed, setRevealed] = useState({ password: false, confirm: false });
    const [focusRequest, setFocusRequest] = useState<{ field: Field }>({ field: 'login' });
    const [life] = useState({ alive: true });

    const fieldId = (field: Field) => `${mode}-${field}`;

    useEffect(() => {
        document.getElementById(`${mode}-${focusRequest.field}`)?.focus();
    }, [mode, focusRequest]);

    useEffect(
        () => () => {
            life.alive = false;
            hideSnackbar();
        },
        [life],
    );

    const validationErrors: FieldTexts = {
        login: validateLogin(values.login),
        password: validatePassword(values.password),
        confirm: isRegister ? validateConfirm(values.password, values.confirm) : undefined,
        code: twoFactor ? validateTotp(values.code) : undefined,
    };

    const errorOf = (field: Field): string | undefined => {
        if (serverErrors[field]) return serverErrors[field];
        return submitted || touched[field] ? validationErrors[field] : undefined;
    };

    const change = (field: Field) => (value: string) => {
        setValues((current) => ({ ...current, [field]: value }));
        setServerErrors({});
        setCredentialsRejected(false);
        hideSnackbar();
    };

    const blur = (field: Field) => () => {
        if (values[field] !== '' && !touched[field]) {
            setTouched((current) => ({ ...current, [field]: true }));
        }
    };

    const toggleReveal = (field: 'password' | 'confirm') => () =>
        setRevealed((current) => ({ ...current, [field]: !current[field] }));

    const send = async () => {
        setPending(true);
        setServerErrors({});
        setCredentialsRejected(false);
        hideSnackbar();

        const credentials = { login: values.login, password: values.password };
        const result = isRegister
            ? await register(credentials)
            : await login(twoFactor ? { ...credentials, user_code: values.code } : credentials);

        if (result.ok) {
            if (isRegister) showToast('Аккаунт создан');
            navigate({ to: '/', replace: true });
            return;
        }
        if (!life.alive) return;

        setPending(false);
        const message = authErrorMessage(result.error, mode);
        switch (result.error.code) {
            case 'invalid_credentials':
                setServerErrors({ password: message });
                setCredentialsRejected(true);
                setFocusRequest({ field: 'password' });
                break;
            case 'two_factor_required':
                setTwoFactor(true);
                setFocusRequest({ field: 'code' });
                break;
            case 'invalid_totp':
                setServerErrors({ code: message });
                setFocusRequest({ field: 'code' });
                break;
            case 'login_taken':
                setServerErrors({ login: message });
                setFocusRequest({ field: 'login' });
                break;
            case 'validation_error': {
                // ошибки полей от BFF — у полей, ошибка без поля — в снекбаре
                const fields = result.error.fields ?? {};
                if (fields.login || fields.password) {
                    setServerErrors(fields);
                    setFocusRequest({ field: fields.login ? 'login' : 'password' });
                    break;
                }
                showSnackbar(message);
                setFocusRequest({ field: 'password' });
                break;
            }
            default:
                showSnackbar(message, { label: 'Повторить', onClick: () => void send() });
                setFocusRequest({ field: 'password' });
        }
    };

    const handleSubmit = (event: Event) => {
        event.preventDefault();
        if (pending) return;

        setSubmitted(true);
        const firstInvalid = (['login', 'password', 'confirm', 'code'] as const).find(
            (field) => validationErrors[field],
        );
        if (firstInvalid) {
            setFocusRequest({ field: firstInvalid });
            return;
        }
        void send();
    };

    return (
        <form className={styles.form} noValidate onSubmit={handleSubmit}>
            <h1 key="title" className={styles.formTitle}>
                {isRegister ? 'Создание аккаунта' : 'Вход'}
            </h1>
            <Input
                key="login"
                id={fieldId('login')}
                label="Логин"
                name="login"
                value={values.login}
                placeholder="Введите логин"
                hint={isRegister ? LOGIN_RULE : undefined}
                error={errorOf('login')}
                invalid={credentialsRejected}
                disabled={pending}
                autocomplete="username"
                onValueChange={change('login')}
                onBlur={blur('login')}
            />
            <Input
                key="password"
                id={fieldId('password')}
                label="Пароль"
                type="password"
                name="password"
                value={values.password}
                placeholder="Введите пароль"
                hint={isRegister ? PASSWORD_RULE : undefined}
                error={errorOf('password')}
                disabled={pending}
                autocomplete={isRegister ? 'new-password' : 'current-password'}
                revealed={revealed.password}
                onToggleReveal={toggleReveal('password')}
                onValueChange={change('password')}
                onBlur={blur('password')}
            />
            {isRegister && (
                <Input
                    key="confirm"
                    id={fieldId('confirm')}
                    label="Повторите пароль"
                    type="password"
                    name="confirm"
                    value={values.confirm}
                    placeholder="Ещё раз тот же пароль"
                    error={errorOf('confirm')}
                    disabled={pending}
                    autocomplete="new-password"
                    revealed={revealed.confirm}
                    onToggleReveal={toggleReveal('confirm')}
                    onValueChange={change('confirm')}
                    onBlur={blur('confirm')}
                />
            )}
            {twoFactor && (
                <Input
                    key="code"
                    id={fieldId('code')}
                    label="Код из приложения"
                    name="code"
                    value={values.code}
                    placeholder="6 цифр"
                    hint="Код двухфакторной аутентификации"
                    error={errorOf('code')}
                    disabled={pending}
                    autocomplete="one-time-code"
                    onValueChange={change('code')}
                    onBlur={blur('code')}
                />
            )}
            <Button key="submit" type="submit" loading={pending} block>
                {isRegister ? 'Создать аккаунт' : 'Войти'}
            </Button>
        </form>
    );
}
