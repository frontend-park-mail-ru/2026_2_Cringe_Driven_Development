import LogoMark from '@assets/logo-mark.svg?react';
import styles from './Logo.module.css';

/**
 * Логотип (Components → Logo).
 * @returns логотип
 */
export function Logo() {
    return (
        <span className={styles.logo}>
            <LogoMark
                key="mark"
                className={styles.mark}
                width={24}
                height={24}
                aria-hidden="true"
            />
            <span key="text">cellestial</span>
        </span>
    );
}
