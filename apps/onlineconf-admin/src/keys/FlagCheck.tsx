import { useEffect, useRef, useState } from '@cdd-team/react';
import { api, isBffError, type Output } from '@api/bff';
import { clsx } from '@cdd-team/clsx';
import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { errorText } from './errorText';
import styles from './KeyPage.module.css';

type ConfUser = Output<'/api/onlineconf/users/resolve'>;
type Evaluation = Output<'/api/onlineconf/keys/evaluate'>;

/** Проверка сохранённого флага для пользователя, найденного по логину. */
export function FlagCheck({
    name,
    dirty,
    revision,
}: {
    name: string;
    /** В форме флага есть несохранённые изменения */
    dirty: boolean;
    /** Растёт с каждым сохранением карточки: прежний результат относится к старым настройкам */
    revision: number;
}) {
    const [text, setText] = useState('');
    const [user, setUser] = useState<ConfUser | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const lookupRef = useRef<AbortController | null>(null);
    useEffect(() => () => lookupRef.current?.abort(), []);

    const cancelLookup = () => {
        lookupRef.current?.abort();
        lookupRef.current = null;
        setBusy(false);
    };

    // значение приходит из поля: сразу после ввода `text` ещё может быть прежним
    const find = async (sent: string) => {
        const login = sent.trim();
        if (lookupRef.current || !login) return;
        if (login.length > 32) {
            setError('Логин не длиннее 32 символов');
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        lookupRef.current = controller;
        setBusy(true);
        setError(undefined);
        try {
            const found = await api('GET', '/api/onlineconf/users/resolve', {
                params: { query: { login } },
                init: { signal },
            });
            if (!signal.aborted) setUser(found);
        } catch (cause) {
            if (signal.aborted) return;
            setUser(undefined);
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
        <section className={clsx(styles.panel, styles.check)} aria-labelledby="flag-check-title">
            <div key="heading">
                <h2 key="title" id="flag-check-title" className={styles.checkTitle}>
                    Проверка пользователя
                </h2>
                <p key="note" className={styles.status} aria-live="polite">
                    {dirty
                        ? 'По сохранённым настройкам · несохранённые изменения не учитываются'
                        : 'По сохранённым настройкам'}
                </p>
            </div>
            <div key="login" className={styles.users} aria-busy={busy}>
                <Input
                    id="flag-check-login"
                    label="Логин пользователя"
                    name="flag-check-login"
                    value={text}
                    placeholder="Логин, затем Enter"
                    hint={busy ? 'Ищем пользователя…' : undefined}
                    error={error}
                    reserveMessage={false}
                    autocomplete="off"
                    onEnter={(value) => void find(value)}
                    onValueChange={(value) => {
                        cancelLookup();
                        setText(value);
                        setUser(undefined);
                        setError(undefined);
                    }}
                />
            </div>
            {user && (
                <p key="user" className={styles.checkUser} aria-live="polite">
                    <span key="label" className={styles.status}>
                        Выбран пользователь
                    </span>
                    <span key="value">{user.login}</span>
                </p>
            )}
            <CheckResult key={`${revision}:${user?.id}`} name={name} user={user} />
        </section>
    );
}

type CheckState =
    | { status: 'idle' | 'loading' }
    | { status: 'done'; result: Evaluation }
    | { status: 'failed'; message: string; retry: boolean };

/**
 * Кнопка проверки и её итог. Перемонтируется при смене пользователя и сохранении карточки: итог
 * пропадает, а незавершённый запрос отменяется, поэтому поздний ответ не показывается.
 */
function CheckResult({ name, user }: { name: string; user: ConfUser | undefined }) {
    const [state, setState] = useState<CheckState>({ status: 'idle' });
    const requestRef = useRef<AbortController | null>(null);
    useEffect(() => () => requestRef.current?.abort(), []);

    const check = async () => {
        if (!user || requestRef.current) return;
        const controller = new AbortController();
        const { signal } = controller;
        requestRef.current = controller;
        setState({ status: 'loading' });
        try {
            const result = await api('GET', '/api/onlineconf/keys/evaluate', {
                params: { query: { name, user_id: user.id } },
                init: { signal },
            });
            if (!signal.aborted) setState({ status: 'done', result });
        } catch (cause) {
            if (signal.aborted) return;
            // отказ никогда не выглядит решением «выключен»
            const appCode = isBffError(cause) ? cause.appCode : undefined;
            setState(
                appCode === 'forbidden'
                    ? {
                          status: 'failed',
                          message: 'Не удалось проверить: нет прав администратора OnlineConf.',
                          retry: false,
                      }
                    : appCode === 'not_found'
                      ? {
                            status: 'failed',
                            message: 'Не удалось проверить: ключ или пользователь не найден.',
                            retry: false,
                        }
                      : {
                            status: 'failed',
                            message: 'Не удалось проверить. Результат неизвестен.',
                            retry: true,
                        },
            );
        } finally {
            if (!signal.aborted) requestRef.current = null;
        }
    };

    return (
        <div className={styles.check}>
            <Button
                key="run"
                block
                disabled={!user}
                loading={state.status === 'loading'}
                onClick={() => void check()}
            >
                Проверить
            </Button>
            <div key="outcome" aria-live="polite">
                {user && state.status === 'done' && (
                    <p
                        key="result"
                        className={clsx(styles.result, state.result.enabled && styles.resultOn)}
                    >
                        Для {user.login}: {state.result.enabled ? 'включён' : 'выключен'} —{' '}
                        {reasonText(state.result)}
                    </p>
                )}
                {state.status === 'failed' && (
                    <div key="failure" className={styles.failure} role="alert">
                        <p key="message">{state.message}</p>
                        {state.retry && (
                            <Button key="retry" variant="secondary" onClick={() => void check()}>
                                Повторить
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Причина решения словами; само решение принимает сервер. */
function reasonText({ enabled, reason }: Evaluation): string {
    if (reason === 'disabled') return 'флаг выключен для всех';
    if (reason === 'excluded') return 'персональное исключение';
    if (reason === 'included') return 'персональное включение';
    return enabled ? 'входит в процент раскатки' : 'не входит в процент раскатки';
}
