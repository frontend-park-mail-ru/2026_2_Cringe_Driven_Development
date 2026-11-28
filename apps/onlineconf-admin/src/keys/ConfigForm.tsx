import { useMemo, useRef, useState } from '@cdd-team/react';
import { api, isBffError, type Output } from '@api/bff';
import { Button } from '@components/Button/Button';
import { Textarea } from '@components/Input/Textarea';
import { checkJson } from './json';
import styles from './KeyPage.module.css';

type Config = Extract<Output<'/api/onlineconf/keys/get'>, { type: 'config' }>;

/** Сохраняет значение и описание конфига, обновляя форму из ответа сервера. */
export function ConfigForm({ card, onSaved }: { card: Config; onSaved: (card: Config) => void }) {
    const savedText = useMemo(() => JSON.stringify(card.value, null, 2), [card.value]);
    const [text, setText] = useState(savedText);
    const [description, setDescription] = useState(card.description);
    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const form = useRef<HTMLFormElement | null>(null);
    const sendingRef = useRef(false);
    const json = useMemo(() => checkJson(text), [text]);
    const dirty = text !== savedText || description !== card.description;

    const submit = async (event: Event) => {
        event.preventDefault();
        if (sendingRef.current || !dirty || !json.ok) return;
        sendingRef.current = true;
        setLoading(true);
        setError(undefined);
        try {
            const updated = await api('POST', '/api/onlineconf/keys/update', {
                contentType: 'application/json',
                body: { name: card.name, type: 'config', description, value: json.value },
            });
            if (!form.current?.isConnected) return;
            if (updated.type !== 'config' || updated.name !== card.name) {
                setError('Сервер вернул данные другого ключа. Обновите страницу.');
                return;
            }
            setText(JSON.stringify(updated.value, null, 2));
            setDescription(updated.description);
            onSaved(updated);
        } catch (cause) {
            if (form.current?.isConnected) {
                setError(
                    isBffError(cause)
                        ? cause.message
                        : 'Не удалось сохранить конфиг. Попробуйте ещё раз.',
                );
            }
        } finally {
            sendingRef.current = false;
            if (form.current?.isConnected) setLoading(false);
        }
    };

    const status = !json.ok
        ? 'Исправьте ошибку, чтобы сохранить'
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
            <div key="json" className={styles.json}>
                <Textarea
                    id="config-value"
                    label="Значение · JSON"
                    name="value"
                    value={text}
                    error={json.ok ? undefined : json.message}
                    disabled={loading}
                    onValueChange={setText}
                />
            </div>
            <Textarea
                key="description"
                id="config-description"
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
                            setText(savedText);
                            setDescription(card.description);
                            setError(undefined);
                        }}
                    >
                        Сбросить
                    </Button>
                )}
                <Button
                    key="save"
                    type="submit"
                    disabled={loading || !dirty || !json.ok}
                    loading={loading}
                >
                    Сохранить
                </Button>
            </div>
        </form>
    );
}
