import { useRef, useState } from '@cdd-team/react';
import { useNavigate } from '@cdd-team/router';
import { api, isBffError } from '@api/bff';
import { Button } from '@components/Button/Button';
import { Modal } from '@components/Modal/Modal';
import { errorText } from './errorText';
import { setUnsaved } from '../leaveGuard';
import styles from './KeyPage.module.css';

const CANCEL_ID = 'delete-key-cancel';

/**
 * Удаление ключа из карточки: подтверждение в модалке, после удаления — список ключей.
 * Ключ, которого уже нет (`not_found`), считается удалённым. `disabled` — форма сохраняет изменения.
 */
export function DeleteKey({ name, disabled }: { name: string; disabled: boolean }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const sendingRef = useRef(false);

    const close = () => {
        if (sendingRef.current) return;
        setOpen(false);
        setError(undefined);
    };

    const submit = async () => {
        if (sendingRef.current) return;
        sendingRef.current = true;
        setSending(true);
        setError(undefined);
        try {
            await api('POST', '/api/onlineconf/keys/delete', {
                contentType: 'application/json',
                body: { name },
            });
        } catch (cause) {
            if (!(isBffError(cause) && cause.appCode === 'not_found')) {
                sendingRef.current = false;
                setSending(false);
                setError(errorText(cause, 'Не удалось удалить ключ. Попробуйте ещё раз.'));
                return;
            }
        }
        // несохранённые правки удалённого ключа терять можно: без вопроса об уходе
        setUnsaved(false);
        void navigate({ to: '/keys' });
    };

    return (
        <>
            <Button key="delete" variant="danger" disabled={disabled} onClick={() => setOpen(true)}>
                Удалить
            </Button>
            {open && (
                <Modal
                    key="confirm"
                    title="Удалить ключ?"
                    lead={name}
                    description="Сервисы перестанут получать его значение и перейдут на значение по умолчанию. Это действие нельзя отменить."
                    initialFocusId={CANCEL_ID}
                    locked={sending}
                    onClose={close}
                >
                    <div className={styles.fields}>
                        {error && (
                            <p key="error" className={styles.error} role="alert">
                                {error}
                            </p>
                        )}
                        <div key="actions" className={styles.actions}>
                            <Button
                                key="cancel"
                                id={CANCEL_ID}
                                variant="secondary"
                                disabled={sending}
                                onClick={close}
                            >
                                Отмена
                            </Button>
                            <Button
                                key="submit"
                                variant="danger"
                                loading={sending}
                                onClick={() => void submit()}
                            >
                                Удалить ключ
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
