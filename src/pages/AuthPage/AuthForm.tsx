import { useEffect, useState } from '@maninthecoat/react';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { useNavigate } from '../../modules/router';
import { login, register } from '../../stores/session';
import { hideSnackbar, showSnackbar } from '../../stores/snackbar';
import { showToast } from '../../stores/toast';
import {
    authErrorMessage,
    LOGIN_RULE,
    PASSWORD_RULE,
    validateConfirm,
    validateLogin,
    validatePassword,
    type AuthMode,
} from '../../utils/credentials';

type Field = 'login' | 'password' | 'confirm';
type FieldTexts = Partial<Record<Field, string>>;

const EMPTY = { login: '', password: '', confirm: '' };
const NOT_TOUCHED = { login: false, password: false, confirm: false };

/** Свойства {@link AuthForm}. */
interface AuthFormProps {
    mode: AuthMode;
}

/**
 * Форма входа или регистрации.
 * Ошибки полей видны после первой отправки или после ухода из заполненного поля.
 * Ошибки сервера и сети — в снекбаре: «Повторить» отправляет форму ещё раз.
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
    const [revealed, setRevealed] = useState({ password: false, confirm: false });
    const [focusRequest, setFocusRequest] = useState<{ field: Field }>({ field: 'login' });

    const fieldId = (field: Field) => `${mode}-${field}`;

    useEffect(() => {
        document.getElementById(`${mode}-${focusRequest.field}`)?.focus();
    }, [mode, focusRequest]);

    useEffect(() => hideSnackbar, []);

    const validationErrors: FieldTexts = {
        login: validateLogin(values.login),
        password: validatePassword(values.password),
        confirm: isRegister ? validateConfirm(values.password, values.confirm) : undefined,
    };

    const errorOf = (field: Field): string | undefined => {
        if (serverErrors[field]) return serverErrors[field];
        return submitted || touched[field] ? validationErrors[field] : undefined;
    };

    const change = (field: Field) => (value: string) => {
        setValues((current) => ({ ...current, [field]: value }));
        setServerErrors({});
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
        hideSnackbar();

        const credentials = { login: values.login, password: values.password };
        const result = isRegister ? await register(credentials) : await login(credentials);

        if (result.ok) {
            if (isRegister) showToast('Аккаунт создан');
            navigate({ to: '/' });
            return;
        }

        setPending(false);
        const message = authErrorMessage(result.error, mode);
        switch (result.error.code) {
            case 'invalid_credentials':
                setServerErrors({ password: message });
                setFocusRequest({ field: 'password' });
                break;
            case 'login_taken':
                setServerErrors({ login: message });
                setFocusRequest({ field: 'login' });
                break;
            case 'validation_error':
                showSnackbar(message);
                break;
            default:
                showSnackbar(message, { label: 'Повторить', onClick: () => void send() });
        }
    };

    const handleSubmit = (event: Event) => {
        event.preventDefault();
        if (pending) return;

        setSubmitted(true);
        const firstInvalid = (['login', 'password', 'confirm'] as const).find(
            (field) => validationErrors[field],
        );
        if (firstInvalid) {
            setFocusRequest({ field: firstInvalid });
            return;
        }
        void send();
    };

    return (
        <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <h1 key="title" className="auth-form__title">
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
            {isRegister ? (
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
            ) : null}
            <Button key="submit" type="submit" loading={pending} block>
                {isRegister ? 'Создать аккаунт' : 'Войти'}
            </Button>
        </form>
    );
}
