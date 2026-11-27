import { clsx } from '@cdd-team/clsx';
import styles from './Badge.module.css';

/** Свойства {@link Badge}. */
interface BadgeProps {
    /** Короткая текстовая метка */
    children: string;
    className?: string;
}

/** Бейдж: короткая текстовая метка, например статус блокнота. */
export function Badge({ children, className }: BadgeProps) {
    return <span className={clsx(styles.badge, className)}>{children}</span>;
}
