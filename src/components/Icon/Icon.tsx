import { clsx } from '../../modules/clsx';
import { ICON_MASKS, type IconName } from './icons';
import './Icon.css';

/** Свойства {@link Icon}. */
interface IconProps {
    /** Имя иконки из макета */
    name: IconName;
    /** Сторона квадрата в px (по умолчанию 16) */
    size?: number;
    /** Дополнительный класс */
    className?: string;
}

/**
 * Декоративная иконка. Цвет наследуется из `color` родителя, для скринридеров не видна.
 * @param props свойства иконки
 * @returns span с CSS-маской
 */
export function Icon({ name, size = 16, className }: IconProps) {
    return (
        <span
            className={clsx('icon', className)}
            style={{ '--icon': ICON_MASKS[name], width: size, height: size }}
            aria-hidden="true"
        />
    );
}
