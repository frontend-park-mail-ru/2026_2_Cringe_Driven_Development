import { useEffect, useState } from '@cdd-team/react';

import { isRpcError, trpc } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { useSessionStore } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import { LOGIN_RULE, validateLogin } from '@utils/credentials';
import { AvatarPicker } from './AvatarPicker';
import styles from './ProfilePage.module.css';

const FIELD_ID = 'profile-login';

/** Свойства {@link LoginForm}. */
interface LoginFormProps {
    /** Сохранённый логин */
    login: string;
}

/**
 * Раздел «Личные данные»: аватар, его смена и смена логина. Занятый логин — красная рамка и
 * снекбар, введённое значение остаётся в поле.
 */
export function LoginForm({ login }: LoginFormProps) {
    const [value, setValue] = useState(login);
    const [submitted, setSubmitted] = useState(false);
    const [taken, setTaken] = useState(false);
    const [pending, setPending] = useState(false);
    const [life] = useState({ alive: true });

    useEffect(
        () => () => {
            life.alive = false;
            hideSnackbar();
        },
        [life],
    );

    const send = async () => {
        setPending(true);
        hideSnackbar();
        try {
            const { login: saved } = await trpc.users.updateLogin.mutate({ login: value });
            // только своё поле: параллельная загрузка аватара не откатывается
            useSessionStore.setState((state) => ({
                user: state.user && { ...state.user, login: saved },
            }));
            if (!life.alive) return;
            setSubmitted(false);
            showToast('Изменения сохранены');
        } catch (error) {
            if (!life.alive) return;
            if (isRpcError(error) && error.data?.appCode === 'login_taken') {
                setTaken(true);
                showSnackbar(`Логин «${value}» уже занят — выберите другой`);
            } else {
                showSnackbar('Не удалось сохранить логин', {
                    label: 'Повторить',
                    onClick: () => void send(),
                });
            }
        }
        if (life.alive) setPending(false);
    };

    const handleSubmit = (event: Event) => {
        event.preventDefault();
        if (pending || value === login) return;
        setSubmitted(true);
        if (validateLogin(value)) {
            document.getElementById(FIELD_ID)?.focus();
            return;
        }
        void send();
    };

    const change = (next: string) => {
        setValue(next);
        setTaken(false);
        hideSnackbar();
    };

    return (
        <form className={styles.section} noValidate onSubmit={handleSubmit}>
            <h2 key="title" className={styles.sectionTitle}>
                Личные данные
            </h2>
            <AvatarPicker key="identity" />
            <Input
                key="input"
                id={FIELD_ID}
                label="Логин"
                name="login"
                value={value}
                placeholder="Введите логин"
                hint={LOGIN_RULE}
                error={submitted ? validateLogin(value) : undefined}
                invalid={taken}
                disabled={pending}
                autocomplete="username"
                icon={value === login ? 'pencil' : undefined}
                onValueChange={change}
            />
            <Button key="save" type="submit" loading={pending} disabled={value === login}>
                Сохранить логин
            </Button>
        </form>
    );
}
