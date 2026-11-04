import { clsx } from '@cdd-team/clsx';
import { Icon, type IconName } from '@components/Icon/Icon';
import styles from './SaveStatus.module.css';

/** Вид подписи статуса (Components → SaveStatus). */
export type SaveStatusTone = 'progress' | 'error' | 'success';

/** Свойства {@link SaveStatus}. */
interface SaveStatusProps {
    tone: SaveStatusTone;
    text: string;
}

const ICON: Record<SaveStatusTone, IconName> = {
    progress: 'spinner',
    error: 'alert',
    success: 'check',
};

/**
 * Подпись статуса в шапке блокнота: «Сохраняем…», «Изменения не сохранены», «Сохранено».
 * Объявляется скринридеру при смене.
 * @param props свойства подписи
 * @returns подпись с иконкой
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
