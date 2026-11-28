import { useEffect, useRef, useState } from '@cdd-team/react';
import { api, isBffError, type Output } from '@api/bff';
import { Icon } from '@components/Icon/Icon';
import { Input } from '@components/Input/Input';
import { errorText } from './errorText';
import { userQuery } from './rules';
import styles from './KeyPage.module.css';

type ConfUser = Output<'/api/onlineconf/users/resolve'>;

/** Столько пользователей BFF принимает в одном списке. */
const LIMIT = 1000;

/** Список пользователей флага: добавление по ID или логину по Enter и удаление. */
export function UserList({
    id,
    label,
    users,
    other,
    otherLabel,
    disabled,
    onChange,
    onPendingChange,
}: {
    id: string;
    label: string;
    users: ConfUser[];
    /** Противоположный список: его пользователи сюда не добавляются */
    other: ConfUser[];
    otherLabel: string;
    disabled: boolean;
    onChange: (users: ConfUser[]) => void;
    /** Идёт поиск или в поле остался недобавленный текст */
    onPendingChange: (pending: boolean) => void;
}) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const lookupRef = useRef<AbortController | null>(null);
    // пока идёт поиск, списки могли измениться: ответ сверяется с актуальными
    const latestRef = useRef({ users, other });
    useEffect(() => {
        latestRef.current = { users, other };
    });
    const pending = busy || text.trim() !== '';

    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    useEffect(() => () => lookupRef.current?.abort(), []);

    // значение приходит из поля: сразу после ввода `text` ещё может быть прежним
    const add = async (sent: string) => {
        if (disabled || lookupRef.current || !sent.trim()) return;
        const query = userQuery(sent);
        if (!query) {
            setError('Введите userID или логин до 32 символов');
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        lookupRef.current = controller;
        setBusy(true);
        setError(undefined);
        try {
            const found = await api('GET', '/api/onlineconf/users/resolve', {
                params: { query },
                init: { signal },
            });
            if (signal.aborted) return;
            const current = latestRef.current;
            const same = (user: ConfUser) => user.id === found.id;
            if (current.other.some(same)) {
                setError(found.login + ' уже в списке «' + otherLabel + '»');
            } else if (current.users.some(same)) {
                setError(found.login + ' уже добавлен');
            } else if (current.users.length >= LIMIT) {
                setError('Не больше ' + LIMIT + ' пользователей');
            } else {
                onChange([...current.users, found]);
                setText((value) => (value === sent ? '' : value));
            }
        } catch (cause) {
            if (signal.aborted) return;
            setError(
                isBffError(cause) && cause.appCode === 'not_found'
                    ? 'Пользователь не найден'
                    : errorText(cause, 'Не удалось найти пользователя. Попробуйте ещё раз.'),
            );
        } finally {
            if (!signal.aborted) {
                lookupRef.current = null;
                setBusy(false);
            }
        }
    };

    return (
        <div className={styles.users} aria-busy={busy}>
            <Input
                key="input"
                id={id}
                label={label}
                name={id}
                value={text}
                placeholder="userID или логин, затем Enter"
                hint={busy ? 'Ищем пользователя…' : undefined}
                error={error}
                disabled={disabled}
                autocomplete="off"
                onEnter={(value) => void add(value)}
                onValueChange={(value) => {
                    setText(value);
                    setError(undefined);
                }}
            />
            {users.length > 0 && (
                <ul key="chips" className={styles.chips} aria-label={label}>
                    {users.map((user) => (
                        <li key={user.id}>
                            <span key="login">{user.login}</span>
                            <button
                                key="remove"
                                type="button"
                                aria-label={'Убрать ' + user.login}
                                disabled={disabled}
                                onClick={() => {
                                    onChange(users.filter((item) => item.id !== user.id));
                                    document.getElementById(id)?.focus();
                                }}
                            >
                                <Icon name="close" size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
