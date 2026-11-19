import { useEffect, useRef, useState } from '@cdd-team/react';
import { useNavigate } from '@cdd-team/router';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Modal } from '@components/Modal/Modal';
import { adoptSession, POLL_INTERVAL_MS, type RuntimeSession } from '@stores/runtime';
import { showToast } from '@stores/toast';
import { deleteNotebook, readSession } from './actions';
import { ClampedName } from './ClampedName';
import { deleteGate, type DeleteGate } from './gate';
import styles from './DeleteNotebookDialog.module.css';

const CANCEL_ID = 'delete-notebook-cancel';
const PRIMARY_ID = 'delete-notebook-primary';
/** Свой id у «Закрыть» запрета: после 409 вид меняется, и фокус переходит в новый вид. */
const CLOSE_ID = 'delete-notebook-close';

/** Свойства {@link DeleteNotebookDialog}. */
interface DeleteNotebookDialogProps {
    notebook: { id: number; name: string };
    /** Уже известная сессия окружения: по ней диалог открывается сразу, без запроса */
    known: RuntimeSession | null;
    /** Сессия блокнота активна по списку блокнотов, сама сессия неизвестна */
    listedActive?: boolean;
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
 * запреты из-за окружения. Открывается по известному состоянию, в фоне уточняет его на сервере и
 * обновляет вид; пока удаление запрещено — опрашивает дальше. Пока идёт запрос, диалог не
 * закрывается и повторно не отправляет.
 */
export function DeleteNotebookDialog({
    notebook,
    known,
    listedActive = false,
    place,
    onClose,
    onGone,
}: DeleteNotebookDialogProps) {
    const navigate = useNavigate();
    const [gate, setGate] = useState<DeleteGate>(
        listedActive ? 'stopFirst' : deleteGate(known, notebook.id),
    );
    /**
     * Сервер отказал (409), а причины не видно: активной сессии нет, очистка или фоновая работа Go
     * наружу не отдаётся. Ждём повторного удаления по кнопке, проверки «нет сессии» вид не меняют.
     */
    const [blind, setBlind] = useState(false);
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    /** Отправка видна сразу, до перерисовки: Escape или второе нажатие в тот же кадр ничего не делают */
    const sendingRef = useRef(false);
    const blindRef = useRef(false);
    const sessionRef = useRef(known);
    /** Растёт после каждой отправки без удаления: проверка начинается заново, прежние ответы отбрасываются */
    const [round, setRound] = useState(0);
    const close = () => {
        if (!sendingRef.current) onClose();
    };

    const waiting = gate !== 'confirm' || blind;
    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const check = async () => {
            const session = await readSession(notebook.id, sessionRef.current);
            if (!alive) return;
            if (session !== 'error' && !sendingRef.current) {
                // только ответ живой проверки текущего round: ответ закрытого диалога стор не трогает
                adoptSession(session);
                sessionRef.current = session;
                const next = deleteGate(session, notebook.id);
                if (next !== 'confirm' || !blindRef.current) {
                    blindRef.current = false;
                    setBlind(false);
                    setGate(next);
                }
            }
            if (waiting) timer = setTimeout(() => void check(), POLL_INTERVAL_MS);
        };
        void check();
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [notebook.id, waiting, round]);

    const submit = async () => {
        if (sendingRef.current) return;
        sendingRef.current = true;
        setSending(true);
        setFailed(false);
        const result = await deleteNotebook(notebook.id);
        if (result === 'deleted' || result === 'notFound') {
            if (result === 'deleted') showToast('Блокнот удалён');
            else showToast('Блокнот не найден', 'info');
            onGone(result);
            return;
        }
        sendingRef.current = false;
        setSending(false);
        // 409: окружение запустилось или ещё завершается — причину уточнит проверка, опрос продолжится
        blindRef.current = result === 'inUse';
        setBlind(blindRef.current);
        setGate(result === 'inUse' ? 'waitStop' : 'confirm');
        setFailed(result === 'failed');
        setRound((current) => current + 1);
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
                onClose={close}
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
                            Удалить блокнот
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    if (blind) {
        return (
            <Modal
                title="Дождитесь завершения окружения"
                lead={name}
                description="Сервер ещё завершает работу с блокнотом. Повторите удаление через несколько секунд."
                initialFocusId={CLOSE_ID}
                locked={sending}
                onClose={close}
            >
                <div className={styles.actions}>
                    <Button
                        key="close"
                        id={CLOSE_ID}
                        variant="secondary"
                        disabled={sending}
                        onClick={close}
                    >
                        Закрыть
                    </Button>
                    <Button
                        key="retry"
                        variant="danger"
                        loading={sending}
                        onClick={() => void submit()}
                    >
                        Повторить удаление
                    </Button>
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
                gate === 'stopFirst'
                    ? STOP_FIRST[place]
                    : 'Удаление станет доступно здесь, когда окружение завершится.'
            }
            initialFocusId={openNotebook ? CLOSE_ID : PRIMARY_ID}
            onClose={onClose}
        >
            <div className={styles.actions}>
                {openNotebook ? (
                    <>
                        <Button key="close" id={CLOSE_ID} variant="secondary" onClick={onClose}>
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
