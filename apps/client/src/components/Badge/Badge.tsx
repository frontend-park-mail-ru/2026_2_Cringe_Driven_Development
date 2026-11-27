import type { ReactNode } from '@cdd-team/react';
import styles from './Badge.module.css';

/** Бейдж: короткая текстовая метка, например статус блокнота. */
export function Badge({
    children,
}: {
    /** Короткая текстовая метка */
    children: ReactNode;
}) {
    return <span className={styles.badge}>{children}</span>;
}
