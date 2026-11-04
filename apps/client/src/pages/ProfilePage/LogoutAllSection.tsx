import { useEffect, useState } from '@cdd-team/react';

import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Modal } from '@components/Modal/Modal';
import { clsx } from '@cdd-team/clsx';
import { useNavigate } from '@cdd-team/router';
import { logoutAll } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import styles from './ProfilePage.module.css';

const CANCEL_ID = 'logout-all-cancel';

/**
 * Раздел «Выход со всех устройств» с подтверждением. Успех — только после подтверждения Go: тогда
 * открывается вход. Сбой — снекбар с ручным повтором без нового подтверждения; потерю сессии
 * обрабатывает транспорт.
 * @returns раздел
 */
export function LogoutAllSection() {
    const navigate = useNavigate();
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [snackbarId, setSnackbarId] = useState(0);
    const [life] = useState({ alive: true });

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    useEffect(() => () => hideSnackbar(snackbarId), [snackbarId]);

    const run = async () => {
        setPending(true);
        hideSnackbar(snackbarId);
        const result = await logoutAll();
        if (result === 'ok') {
            showToast('Вы вышли на всех устройствах', 'info');
            navigate({ to: '/login', replace: true });
            return;
        }
        if (!life.alive || result === 'lost') return;
        setPending(false);
        setConfirming(false);
        setSnackbarId(
            showSnackbar('Не удалось выйти на всех устройствах', {
                label: 'Повторить',
                onClick: () => void run(),
            }),
        );
    };

    const close = () => {
        if (!pending) setConfirming(false);
    };

    return (
        <section className={clsx(styles.section, styles.danger)}>
            <h2 key="title" className={styles.dangerTitle}>
                Выход со всех устройств
            </h2>
            <p key="warning" className={styles.warning}>
                <Icon key="icon" name="alert" className={styles.warningIcon} />
                <span key="text">
                    Вы выйдете из аккаунта на всех устройствах, включая это. Для продолжения
                    потребуется войти снова.
                </span>
            </p>
            <Button
                key="open"
                variant="danger"
                loading={pending && !confirming}
                onClick={() => setConfirming(true)}
            >
                Выйти на всех устройствах
            </Button>
            {confirming && (
                <Modal
                    key="confirm"
                    title="Выйти со всех устройств?"
                    description="Вы выйдете из аккаунта на всех устройствах."
                    initialFocusId={CANCEL_ID}
                    onClose={close}
                >
                    <div className={styles.dialogActions}>
                        <Button
                            key="cancel"
                            id={CANCEL_ID}
                            variant="secondary"
                            disabled={pending}
                            onClick={close}
                        >
                            Отменить
                        </Button>
                        <Button
                            key="confirm"
                            variant="danger"
                            loading={pending}
                            onClick={() => void run()}
                        >
                            {pending ? 'Выходим…' : 'Выйти'}
                        </Button>
                    </div>
                </Modal>
            )}
        </section>
    );
}
