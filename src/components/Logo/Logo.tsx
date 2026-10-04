import logoMarkUrl from '@assets/logo-mark.svg';
import './Logo.css';

/**
 * Логотип (Components → Logo).
 * @returns логотип
 */
export function Logo() {
    return (
        <span className="logo">
            <img
                key="mark"
                className="logo__mark"
                src={logoMarkUrl}
                alt=""
                width={24}
                height={24}
            />
            <span key="text">cellestial</span>
        </span>
    );
}
