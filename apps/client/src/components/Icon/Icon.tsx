import { clsx } from '@cdd-team/clsx';
import AlertIcon from '@assets/icons/alert.svg?react';
import BackIcon from '@assets/icons/back.svg?react';
import CheckIcon from '@assets/icons/check.svg?react';
import CloseIcon from '@assets/icons/close.svg?react';
import DotIcon from '@assets/icons/dot.svg?react';
import DownIcon from '@assets/icons/down.svg?react';
import EyeIcon from '@assets/icons/eye.svg?react';
import EyeSlashIcon from '@assets/icons/eye-slash.svg?react';
import FileIcon from '@assets/icons/file.svg?react';
import HelpIcon from '@assets/icons/help.svg?react';
import InfoIcon from '@assets/icons/info.svg?react';
import LogoutIcon from '@assets/icons/logout.svg?react';
import OrbitIcon from '@assets/icons/orbit.svg?react';
import PencilIcon from '@assets/icons/pencil.svg?react';
import PlayIcon from '@assets/icons/play.svg?react';
import PlusIcon from '@assets/icons/plus.svg?react';
import SearchIcon from '@assets/icons/search.svg?react';
import SpinnerIcon from '@assets/icons/spinner.svg?react';
import SquareIcon from '@assets/icons/square.svg?react';
import StopIcon from '@assets/icons/stop.svg?react';
import TrashIcon from '@assets/icons/trash.svg?react';
import UpIcon from '@assets/icons/up.svg?react';
import UserIcon from '@assets/icons/user.svg?react';
import styles from './Icon.module.css';

const ICONS = {
    eye: EyeIcon,
    eyeSlash: EyeSlashIcon,
    alert: AlertIcon,
    back: BackIcon,
    trash: TrashIcon,
    plus: PlusIcon,
    close: CloseIcon,
    info: InfoIcon,
    logout: LogoutIcon,
    check: CheckIcon,
    dot: DotIcon,
    user: UserIcon,
    pencil: PencilIcon,
    spinner: SpinnerIcon,
    up: UpIcon,
    down: DownIcon,
    play: PlayIcon,
    stop: StopIcon,
    orbit: OrbitIcon,
    help: HelpIcon,
    square: SquareIcon,
    file: FileIcon,
    search: SearchIcon,
};

/** Имя иконки из макета. */
export type IconName = keyof typeof ICONS;

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
 * @returns svg-иконка
 */
export function Icon({ name, size = 16, className }: IconProps) {
    const Svg = ICONS[name];
    return (
        <Svg
            className={clsx(styles.icon, className)}
            width={size}
            height={size}
            aria-hidden="true"
        />
    );
}
