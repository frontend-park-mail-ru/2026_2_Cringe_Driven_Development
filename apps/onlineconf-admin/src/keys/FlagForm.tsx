import { useEffect, useRef, useState } from '@cdd-team/react';
import { api, isBffError, type Output } from '@api/bff';
import { Button } from '@components/Button/Button';
import { Textarea } from '@components/Input/Textarea';
import { DeleteKey } from './DeleteKey';
import { errorText } from './errorText';
import { rolloutChoices, rolloutHint } from './rules';
import { UserList } from './UserList';
import { setUnsaved } from '../leaveGuard';
import styles from './KeyPage.module.css';

type Flag = Extract<Output<'/api/onlineconf/keys/get'>, { type: 'flag' }>;
type ConfUser = Flag['include_users'][number];

const includeLabel = 'Принудительно включить';
const excludeLabel = 'Принудительно исключить';

/** Один и тот же набор пользователей без учёта порядка. */
function sameUsers(left: ConfUser[], right: ConfUser[]): boolean {
    const ids = new Set(right.map((user) => user.id));
    return left.length === right.length && left.every((user) => ids.has(user.id));
}

/** Сохраняет правила и описание флага, обновляя форму из ответа сервера. */
export function FlagForm({
    card,
    onSaved,
    onDirtyChange,
}: {
    card: Flag;
    onSaved: (card: Flag) => void;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const [enabled, setEnabled] = useState(card.enabled);
    const [percent, setPercent] = useState(card.rollout_percent);
    const [now, setNow] = useState(0);
    const [include, setInclude] = useState(card.include_users);
    const [exclude, setExclude] = useState(card.exclude_users);
    const [includePending, setIncludePending] = useState(false);
    const [excludePending, setExcludePending] = useState(false);
    const [description, setDescription] = useState(card.description);
    const [resets, setResets] = useState(0);
    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const form = useRef<HTMLFormElement | null>(null);
    const sendingRef = useRef(false);
    const pending = includePending || excludePending;
    const policy = card.rollout_policy;
    const hint = rolloutHint(card.enabled, card.rollout_percent, policy, now);
    const dirty =
        pending ||
        enabled !== card.enabled ||
        percent !== card.rollout_percent ||
        !sameUsers(include, card.include_users) ||
        !sameUsers(exclude, card.exclude_users) ||
        description !== card.description;
    const invalid = pending;

    useEffect(() => {
        setUnsaved(dirty);
        onDirtyChange(dirty);
        return () => setUnsaved(false);
    }, [dirty, onDirtyChange]);

    // Время клиента — только подсказка: после выдержки шаг становится доступным сам
    useEffect(() => {
        setNow(Date.now());
        if (policy.next_allowed_at === null) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [policy.next_allowed_at]);

    const fill = (source: Flag) => {
        setEnabled(source.enabled);
        setPercent(source.rollout_percent);
        setInclude(source.include_users);
        setExclude(source.exclude_users);
        setDescription(source.description);
    };

    /** Перечитывает карточку после отказа сервера: форма показывает только подтверждённое. */
    const reload = async () => {
        try {
            const fresh = await api('GET', '/api/onlineconf/keys/get', {
                params: { query: { name: card.name } },
            });
            if (fresh.type !== 'flag' || !form.current?.isConnected) return;
            fill(fresh);
            onSaved(fresh);
        } catch {
            // карточка остаётся прежней; текст ошибки уже показан
        }
    };

    const submit = async (event: Event) => {
        event.preventDefault();
        if (sendingRef.current || !dirty || pending) return;
        sendingRef.current = true;
        setLoading(true);
        setError(undefined);
        try {
            const updated = await api('POST', '/api/onlineconf/keys/update', {
                contentType: 'application/json',
                body: {
                    name: card.name,
                    type: 'flag',
                    description,
                    enabled,
                    rollout_percent: percent,
                    include_user_ids: include.map((user) => user.id),
                    exclude_user_ids: exclude.map((user) => user.id),
                },
            });
            if (!form.current?.isConnected) return;
            if (updated.type !== 'flag' || updated.name !== card.name) {
                setError('Сервер вернул данные другого ключа. Обновите страницу.');
                return;
            }
            fill(updated);
            onSaved(updated);
        } catch (cause) {
            if (!form.current?.isConnected) return;
            if (isBffError(cause) && cause.appCode === 'rollout_step_not_allowed') {
                setError(
                    'Этот шаг раскатки сейчас недоступен: выдержка ещё идёт или процент уже изменили. Показано актуальное состояние.',
                );
                await reload();
                return;
            }
            setError(errorText(cause, 'Не удалось сохранить флаг. Попробуйте ещё раз.'));
        } finally {
            sendingRef.current = false;
            if (form.current?.isConnected) setLoading(false);
        }
    };

    const status = pending
        ? 'Добавьте пользователя по Enter или очистите поле'
        : dirty
          ? 'Есть несохранённые изменения'
          : 'Нет несохранённых изменений';

    return (
        <form
            ref={form}
            className={styles.editor}
            noValidate
            onSubmit={(event) => void submit(event)}
        >
            <label key="enabled" className={styles.toggle}>
                <input
                    key="switch"
                    type="checkbox"
                    role="switch"
                    aria-checked={enabled ? 'true' : 'false'}
                    checked={enabled}
                    disabled={loading}
                    aria-describedby="flag-enabled-hint"
                    onChange={(event) => setEnabled((event.target as HTMLInputElement).checked)}
                />
                <span key="title" className={styles.toggleTitle}>
                    {enabled ? 'Флаг включён' : 'Флаг выключен'}
                </span>
            </label>
            <p key="enabled-hint" id="flag-enabled-hint" className={styles.toggleHint}>
                Если выключить, флаг не работает ни у кого; процент и списки сохранятся.
            </p>
            <fieldset key="rollout" className={styles.rollout} aria-describedby="flag-rollout-hint">
                <legend key="label" className={styles.status}>
                    Раскатка на процент пользователей · сохранено {card.rollout_percent}%
                </legend>
                <div key="stages" className={styles.stages}>
                    {rolloutChoices(card.rollout_percent, policy).map((stage) => {
                        const raise = stage > card.rollout_percent;
                        return (
                            <label key={stage} className={styles.stage}>
                                <input
                                    key="radio"
                                    type="radio"
                                    name="rollout_percent"
                                    value={String(stage)}
                                    checked={percent === stage}
                                    disabled={loading || (raise && (hint.waiting || !enabled))}
                                    onChange={() => setPercent(stage)}
                                />
                                <span key="text">
                                    {stage}%
                                    {stage === card.rollout_percent
                                        ? ' · сейчас'
                                        : raise
                                          ? ' · следующий шаг'
                                          : ''}
                                </span>
                            </label>
                        );
                    })}
                </div>
                <p key="hint" id="flag-rollout-hint" className={styles.status} aria-live="polite">
                    {hint.text} Снизить процент или выключить флаг можно сразу. Пользователь
                    попадает в раскатку по хэшу userID и ключа — при увеличении процента уже
                    включённые остаются.
                </p>
            </fieldset>
            <UserList
                key={'include-' + resets}
                id="flag-include"
                label={includeLabel}
                users={include}
                other={exclude}
                otherLabel={excludeLabel}
                disabled={loading}
                onChange={setInclude}
                onPendingChange={setIncludePending}
            />
            <UserList
                key={'exclude-' + resets}
                id="flag-exclude"
                label={excludeLabel}
                users={exclude}
                other={include}
                otherLabel={includeLabel}
                disabled={loading}
                onChange={setExclude}
                onPendingChange={setExcludePending}
            />
            <Textarea
                key="description"
                id="flag-description"
                label="Описание"
                name="description"
                value={description}
                disabled={loading}
                onValueChange={setDescription}
            />
            {error && (
                <p key="error" className={styles.error} role="alert">
                    {error}
                </p>
            )}
            <div key="actions" className={styles.actions}>
                <p key="status" className={styles.status} aria-live="polite">
                    {status}
                </p>
                <DeleteKey key="delete" name={card.name} disabled={loading} />
                {dirty && (
                    <Button
                        key="reset"
                        variant="secondary"
                        disabled={loading}
                        onClick={() => {
                            if (sendingRef.current) return;
                            fill(card);
                            // новые списки: набранный текст и незавершённый поиск пропадают
                            setResets((value) => value + 1);
                            setError(undefined);
                        }}
                    >
                        Сбросить
                    </Button>
                )}
                <Button
                    key="save"
                    type="submit"
                    disabled={loading || !dirty || invalid}
                    loading={loading}
                >
                    Сохранить
                </Button>
            </div>
        </form>
    );
}
