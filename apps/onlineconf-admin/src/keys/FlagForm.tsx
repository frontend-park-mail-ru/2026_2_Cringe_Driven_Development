import { useEffect, useRef, useState } from '@cdd-team/react';
import { api, type Output } from '@api/bff';
import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { Textarea } from '@components/Input/Textarea';
import { errorText } from './errorText';
import { parsePercent } from './rules';
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
export function FlagForm({ card, onSaved }: { card: Flag; onSaved: (card: Flag) => void }) {
    const [enabled, setEnabled] = useState(card.enabled);
    const [percentText, setPercentText] = useState(String(card.rollout_percent));
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
    const percent = parsePercent(percentText);
    const pending = includePending || excludePending;
    const dirty =
        pending ||
        enabled !== card.enabled ||
        percentText !== String(card.rollout_percent) ||
        !sameUsers(include, card.include_users) ||
        !sameUsers(exclude, card.exclude_users) ||
        description !== card.description;
    const invalid = percent === undefined || pending;

    useEffect(() => {
        setUnsaved(dirty);
        return () => setUnsaved(false);
    }, [dirty]);

    const fill = (source: Flag) => {
        setEnabled(source.enabled);
        setPercentText(String(source.rollout_percent));
        setInclude(source.include_users);
        setExclude(source.exclude_users);
        setDescription(source.description);
    };

    const submit = async (event: Event) => {
        event.preventDefault();
        if (sendingRef.current || !dirty || percent === undefined || pending) return;
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
            if (form.current?.isConnected) {
                setError(errorText(cause, 'Не удалось сохранить флаг. Попробуйте ещё раз.'));
            }
        } finally {
            sendingRef.current = false;
            if (form.current?.isConnected) setLoading(false);
        }
    };

    const status =
        percent === undefined
            ? 'Исправьте ошибку, чтобы сохранить'
            : pending
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
            <div key="rollout" className={styles.rollout}>
                <div key="controls" className={styles.rolloutControls}>
                    <input
                        key="slider"
                        className={styles.slider}
                        type="range"
                        min="0"
                        max="100"
                        value={String(percent ?? card.rollout_percent)}
                        disabled={loading}
                        aria-label="Раскатка на процент пользователей"
                        onInput={(event) =>
                            setPercentText((event.target as HTMLInputElement).value)
                        }
                    />
                    <div key="number" className={styles.percent}>
                        <Input
                            id="flag-percent"
                            label="Процент"
                            name="rollout_percent"
                            value={percentText}
                            invalid={percent === undefined}
                            reserveMessage={false}
                            disabled={loading}
                            autocomplete="off"
                            onValueChange={setPercentText}
                        />
                    </div>
                    <span key="sign" className={styles.percentSign} aria-hidden="true">
                        %
                    </span>
                </div>
                {percent === undefined && (
                    <p key="error" className={styles.error} role="alert">
                        Целое число от 0 до 100
                    </p>
                )}
                <p key="hint" className={styles.status}>
                    Пользователь попадает в раскатку по хэшу userID и ключа — при увеличении
                    процента уже включённые остаются.
                </p>
            </div>
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
