import { Icon } from '../Icon/Icon';
import './Banner.css';

/** Свойства {@link Banner}. */
interface BannerProps {
    /** Текст ошибки */
    message: string;
}

/**
 * Ошибка отправки формы целиком (Components → Banner, Type=Error) — когда виновато не одно поле,
 * а связь с сервером или сам сервер.
 * @param props свойства баннера
 * @returns блок с ошибкой
 */
export function Banner({ message }: BannerProps) {
    return (
        <div className="banner" role="alert">
            <Icon key="icon" name="alert" className="banner__icon" />
            <p key="text" className="banner__text">
                {message}
            </p>
        </div>
    );
}
