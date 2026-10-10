import { useEffect, useState } from '@maninthecoat/react';
import { Button } from '@components/Button/Button';
import { Modal } from '@components/Modal/Modal';
import { useNavigate } from '@modules/router';
import { logout } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import styles from './ProfileMenu.module.css';

const STAY_ID = 'logout-stay';

/** Свойства {@link LogoutDialog}. */
interface LogoutDialogProps {
    onClose: () => void;
}

/**
 * Модалка «Выйти из аккаунта?». После выхода открывается страница входа.
 * @param {LogoutDialogProps} props свойства модалки
 * @returns {JSX.Element} модалка
 */
export function LogoutDialog({ onClose }: LogoutDialogProps) {
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [life] = useState({ alive: true });
    const [snackbarId, setSnackbarId] = useState(0);

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    useEffect(() => () => hideSnackbar(snackbarId), [snackbarId]);

    const close = () => {
        if (!pending) onClose();
    };

    const confirm = async () => {
        setPending(true);
        hideSnackbar(snackbarId);

        const ok = await logout();
        if (!life.alive) return;
        if (ok) {
            showToast('Вы вышли из аккаунта', 'info');
            navigate({ to: '/login', replace: true });
            return;
        }

        setPending(false);
        setSnackbarId(
            showSnackbar('Не удалось выйти', { label: 'Повторить', onClick: () => void confirm() }),
        );
    };

    return (
        <Modal title="Выйти из аккаунта?" initialFocusId={STAY_ID} onClose={close}>
            <div className={styles.dialog}>
                <p key="text" className={styles.dialogText}>
                    Блокноты сохранятся — войдите снова, чтобы продолжить работу.
                </p>
                <div key="actions" className={styles.dialogActions}>
                    <Button key="stay" id={STAY_ID} variant="secondary" onClick={close}>
                        Остаться
                    </Button>
                    <Button
                        key="logout"
                        variant="danger"
                        loading={pending}
                        onClick={() => void confirm()}
                    >
                        {pending ? 'Выходим…' : 'Выйти'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
