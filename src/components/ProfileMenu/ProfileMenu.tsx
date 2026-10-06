import { useEffect, useState } from '@maninthecoat/react';
import { Avatar } from '@components/Avatar/Avatar';
import { Icon } from '@components/Icon/Icon';
import { clsx } from '@modules/clsx';
import { LogoutDialog } from './LogoutDialog';
import styles from './ProfileMenu.module.css';

const ROOT_ID = 'profile-menu';
const TRIGGER_ID = 'profile-menu-trigger';
const POPUP_ID = 'profile-menu-popup';

/** Свойства {@link ProfileMenu}. */
interface ProfileMenuProps {
    /** Логин вошедшего пользователя */
    login: string;
}

/**
 * Аватар с меню профиля (Components → Menu / Profile): кто вошёл и выход.
 * @param {ProfileMenuProps} props свойства меню
 * @returns {JSX.Element} аватар с меню
 */
export function ProfileMenu({ login }: ProfileMenuProps) {
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        if (!open) return;
        const closeOnOutside = (event: PointerEvent) => {
            const root = document.getElementById(ROOT_ID);
            if (event.target instanceof Node && root?.contains(event.target)) return;
            setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            document.getElementById(TRIGGER_ID)?.focus();
        };
        document.addEventListener('pointerdown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const askLogout = () => {
        document.getElementById(TRIGGER_ID)?.focus();
        setOpen(false);
        setConfirming(true);
    };

    return (
        <div id={ROOT_ID} className={styles.menu}>
            <button
                key="trigger"
                id={TRIGGER_ID}
                className={styles.trigger}
                type="button"
                aria-label="Меню профиля"
                aria-expanded={open ? 'true' : 'false'}
                aria-controls={open ? POPUP_ID : undefined}
                onClick={() => setOpen((current) => !current)}
            >
                <Avatar login={login} className={styles.avatar} />
            </button>
            {open && (
                <div key="popup" id={POPUP_ID} className={styles.popup}>
                    <div key="account" className={styles.account}>
                        <span key="caption" className={styles.caption}>
                            Вы вошли как
                        </span>
                        <span key="login" className={styles.login}>
                            {login}
                        </span>
                    </div>
                    <hr key="divider" className={styles.divider} />
                    <button
                        key="logout"
                        className={clsx(styles.item, styles.danger)}
                        type="button"
                        onClick={askLogout}
                    >
                        <Icon key="icon" name="logout" />
                        <span key="label">Выйти</span>
                    </button>
                </div>
            )}
            {confirming && <LogoutDialog key="logout" onClose={() => setConfirming(false)} />}
        </div>
    );
}
