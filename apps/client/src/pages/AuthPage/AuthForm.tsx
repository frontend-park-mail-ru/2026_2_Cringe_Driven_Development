import { useEffect, useState } from '@cdd-team/react';

import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Input } from '@components/Input/Input';
import { OTP_LENGTH, OtpInput } from '@components/OtpInput/OtpInput';
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
    type AuthMode,
} from '@utils/credentials';
import styles from './AuthPage.module.css';

type Field = 'login' | 'password' | 'confirm';
type FieldTexts = Partial<Record<Field, string>>;

const CODE_ID = 'login-code';

const EMPTY = { login: '', password: '', confirm: '' };
const NOT_TOUCHED = { login: false, password: false, confirm: false };

/** Свойства {@link AuthForm}. */
interface AuthFormProps {
    mode: AuthMode;
    /** Вход перешёл к шагу кода 2FA или вернулся к логину и паролю */
    onCodeStep?: (active: boolean) => void;
}

/**
 * Форма входа или регистрации.
 * Ошибки полей видны после первой отправки или после ухода из заполненного поля.
 * Ошибки сервера и сети — в снекбаре: «Повторить» отправляет форму ещё раз.
 * Если у аккаунта 2FA (`two_factor_required`), вход продолжается шагом кода из приложения.
 * @param props свойства формы
 * @returns форма
 */
export function AuthForm({ mode, onCodeStep }: AuthFormProps) {
    const isRegister = mode === 'register';
    const navigate = useNavigate();

    const [values, setValues] = useState(EMPTY);
    const [touched, setTouched] = useState(NOT_TOUCHED);
    const [submitted, setSubmitted] = useState(false);
    const [pending, setPending] = useState(false);
    const [serverErrors, setServerErrors] = useState<FieldTexts>({});
    // Сервер не сказал, что неверно, — подсвечиваем и логин, сообщение только под паролем
    const [credentialsRejected, setCredentialsRejected] = useState(false);
    const [revealed, setRevealed] = useState({ password: false, confirm: false });
    const [focusRequest, setFocusRequest] = useState<{ field: Field | 'code' }>({
        field: 'login',
    });
    const [codeStep, setCodeStep] = useState(false);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | undefined>(undefined);
    const [life] = useState({ alive: true });

    const fieldId = (field: Field) => `${mode}-${field}`;

    useEffect(() => {
        document.getElementById(`${mode}-${focusRequest.field}`)?.focus();
    }, [mode, focusRequest]);

    const showCodeStep = (active: boolean) => {
        setCodeStep(active);
        onCodeStep?.(active);
    };

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

    const send = async (userCode?: string) => {
        setPending(true);
        setServerErrors({});
        setCredentialsRejected(false);
        hideSnackbar();

        const credentials = { login: values.login, password: values.password };
        const result = isRegister
            ? await register(credentials)
            : await login(
                  userCode === undefined ? credentials : { ...credentials, user_code: userCode },
              );

        if (result.ok) {
            if (isRegister) showToast('Аккаунт создан');
            navigate({ to: '/', replace: true });
            return;
        }
        if (!life.alive) return;

        setPending(false);
        const message = authErrorMessage(result.error, mode);
        switch (result.error.code) {
            case 'two_factor_required':
                setCode('');
                setCodeError(undefined);
                showCodeStep(true);
                setFocusRequest({ field: 'code' });
                break;
            case 'invalid_totp':
                setCodeError(message);
                setFocusRequest({ field: 'code' });
                break;
            case 'invalid_credentials':
                // пароль сменили, пока вводили код: снова логин и пароль
                if (userCode !== undefined) showCodeStep(false);
                setServerErrors({ password: message });
                setCredentialsRejected(true);
                setFocusRequest({ field: 'password' });
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
                showSnackbar(message, { label: 'Повторить', onClick: () => void send(userCode) });
                setFocusRequest({ field: userCode === undefined ? 'password' : 'code' });
        }
    };

    const changeCode = (value: string) => {
        setCode(value);
        setCodeError(undefined);
        hideSnackbar();
    };

    const submitCode = (value: string) => {
        if (pending || value.length < OTP_LENGTH) return;
        void send(value);
    };

    const backToCredentials = () => {
        hideSnackbar();
        showCodeStep(false);
        setFocusRequest({ field: 'password' });
    };

    if (codeStep) {
        return (
            <form
                className={styles.form}
                noValidate
                onSubmit={(event: Event) => {
                    event.preventDefault();
                    submitCode(code);
                }}
            >
                <button
                    key="back"
                    type="button"
                    className={styles.back}
                    disabled={pending}
                    onClick={backToCredentials}
                >
                    <Icon key="icon" name="back" />
                    Назад ко входу
                </button>
                <h1 key="title" className={styles.formTitle}>
                    Подтвердите вход
                </h1>
                <p key="description" className={styles.formDescription}>
                    Введите 6-значный код из Яндекс Ключа или Google Authenticator для аккаунта{' '}
                    {values.login}.
                </p>
                <OtpInput
                    key="code"
                    id={CODE_ID}
                    label="Код из приложения"
                    value={code}
                    error={codeError}
                    disabled={pending}
                    onValueChange={changeCode}
                    onComplete={submitCode}
                />
                <Button
                    key="submit"
                    type="submit"
                    loading={pending}
                    disabled={code.length < OTP_LENGTH}
                    block
                >
                    Войти
                </Button>
            </form>
        );
    }

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
            <Button key="submit" type="submit" loading={pending} block>
                {isRegister ? 'Создать аккаунт' : 'Войти'}
            </Button>
        </form>
    );
}
