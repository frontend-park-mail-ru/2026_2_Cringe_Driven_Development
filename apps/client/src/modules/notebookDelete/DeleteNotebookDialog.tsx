import { useState } from '@cdd-team/react';
import { useNavigate } from '@cdd-team/router';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Modal } from '@components/Modal/Modal';
import { showToast } from '@stores/toast';
import { deleteNotebook, inUseGate } from './actions';
import { ClampedName } from './ClampedName';
import type { DeleteGate } from './gate';
import styles from './DeleteNotebookDialog.module.css';

const CANCEL_ID = 'delete-notebook-cancel';
const PRIMARY_ID = 'delete-notebook-primary';

/** Свойства {@link DeleteNotebookDialog}. */
interface DeleteNotebookDialogProps {
    notebook: { id: number; name: string };
    /** Что показать при открытии: подтверждение или запрет */
    gate: DeleteGate;
    /** Где открыт: на главной у запрета есть «Открыть блокнот» */
    place: 'home' | 'editor';
    onClose: () => void;
    /** Блокнот удалён (204) или не найден (404): страница обновляет список или уходит на главную */
    onGone: (result: 'deleted' | 'notFound') => void;
}

const STOP_FIRST = {
    home: 'Откройте блокнот и нажмите „Завершить окружение“, затем повторите удаление.',
    editor: 'Нажмите „Завершить окружение“ в шапке, затем повторите удаление.',
};

/**
 * Диалог удаления блокнота для главной и редактора: подтверждение, отправка, ошибка с повтором и
 * запреты из-за окружения. Пока идёт запрос, диалог не закрывается и повторно не отправляет.
 * @param props свойства диалога
 * @returns модалка
 */
export function DeleteNotebookDialog({
    notebook,
    gate: initial,
    place,
    onClose,
    onGone,
}: DeleteNotebookDialogProps) {
    const navigate = useNavigate();
    const [gate, setGate] = useState<DeleteGate>(initial);
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);

    const submit = async () => {
        if (sending) return;
        setSending(true);
        setFailed(false);
        const result = await deleteNotebook(notebook.id);
        if (result === 'deleted' || result === 'notFound') {
            if (result === 'deleted') showToast('Блокнот удалён');
            else showToast('Блокнот не найден', 'info');
            onGone(result);
            return;
        }
        if (result === 'inUse') setGate(await inUseGate(notebook.id));
        else setFailed(true);
        setSending(false);
    };

    const name = <ClampedName key={notebook.id} name={notebook.name} />;

    if (gate === 'confirm') {
        return (
            <Modal
                title="Удалить блокнот?"
                lead={name}
                description="Все ячейки и сохранённые результаты будут удалены навсегда. Это действие нельзя отменить."
                initialFocusId={CANCEL_ID}
                locked={sending}
                onClose={onClose}
            >
                <div className={styles.body}>
                    {failed && (
                        <p key="error" className={styles.error} role="alert">
                            <Icon key="icon" name="alert" className={styles.alert} />
                            <span key="text">Не удалось удалить блокнот. Попробуйте ещё раз</span>
                        </p>
                    )}
                    <div key="actions" className={styles.actions}>
                        <Button
                            key="cancel"
                            id={CANCEL_ID}
                            variant="secondary"
                            disabled={sending}
                            onClick={onClose}
                        >
                            Отмена
                        </Button>
                        <Button
                            key="submit"
                            variant="danger"
                            loading={sending}
                            onClick={() => void submit()}
                        >
                            Удалить блокнот
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    const openNotebook = place === 'home' && gate === 'stopFirst';
    return (
        <Modal
            title={
                gate === 'stopFirst'
                    ? 'Сначала завершите окружение'
                    : 'Дождитесь завершения окружения'
            }
            lead={name}
            description={
                gate === 'stopFirst' ? STOP_FIRST[place] : 'После завершения повторите удаление.'
            }
            initialFocusId={openNotebook ? CANCEL_ID : PRIMARY_ID}
            onClose={onClose}
        >
            <div className={styles.actions}>
                {openNotebook ? (
                    <>
                        <Button key="close" id={CANCEL_ID} variant="secondary" onClick={onClose}>
                            Закрыть
                        </Button>
                        <Button
                            key="open"
                            onClick={() =>
                                navigate({
                                    to: '/notebooks/$notebookId',
                                    params: { notebookId: notebook.id },
                                })
                            }
                        >
                            Открыть блокнот
                        </Button>
                    </>
                ) : (
                    <Button key="ok" id={PRIMARY_ID} onClick={onClose}>
                        Понятно
                    </Button>
                )}
            </div>
        </Modal>
    );
}
