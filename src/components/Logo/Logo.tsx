import logoMarkUrl from '@assets/logo-mark.svg';
import styles from './Logo.module.css';

/**
 * Логотип (Components → Logo).
 * @returns {JSX.Element} логотип
 */
export function Logo() {
    return (
        <span className={styles.logo}>
            <img
                key="mark"
                className={styles.mark}
                src={logoMarkUrl}
                alt=""
                width={24}
                height={24}
            />
            <span key="text">cellestial</span>
        </span>
    );
}
