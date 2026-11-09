import { clsx } from '@cdd-team/clsx';
import { Icon, type IconName } from '@components/Icon/Icon';
import styles from './SaveStatus.module.css';

/** Вид подписи статуса (Components → SaveStatus). */
export type SaveStatusTone = 'progress' | 'error' | 'success' | 'warning' | 'neutral';

/** Свойства {@link SaveStatus}. */
interface SaveStatusProps {
    tone: SaveStatusTone;
    text: string;
}

const ICON: Record<SaveStatusTone, IconName> = {
    progress: 'orbit',
    error: 'alert',
    success: 'check',
    warning: 'help',
    neutral: 'square',
};

/**
 * Подпись статуса в шапке блокнота: сохранение («Сохраняем…», «Сохранено») и выполнение
 * («Выполняется», «Результат неизвестен», «Выполнение остановлено»).
 * Объявляется скринридеру при смене.
 */
export function SaveStatus({ tone, text }: SaveStatusProps) {
    return (
        <span className={clsx(styles.status, styles[tone])} aria-live="polite">
            <Icon
                key="icon"
                name={ICON[tone]}
                className={clsx(tone === 'progress' && styles.spin)}
            />
            <span key="text">{text}</span>
        </span>
    );
}
