import { clsx } from '@cdd-team/clsx';
import styles from './ProfilePage.module.css';

const field = (key: string) => (
    <div key={key} className={styles.skeletonField}>
        <span key="label" className={clsx(styles.bar, styles.barLabel)} />
        <span key="input" className={clsx(styles.bar, styles.barInput)} />
    </div>
);

/**
 * Загрузка профиля: скелетоны на месте аватара, полей и кнопок.
 * @returns разделы со скелетонами
 */
export function ProfileSkeleton() {
    return (
        <div className={styles.sections} aria-hidden="true">
            <section key="data" className={styles.section}>
                <h2 key="title" className={styles.sectionTitle}>
                    Личные данные
                </h2>
                <div key="identity" className={styles.identity}>
                    <span key="avatar" className={clsx(styles.bar, styles.barAvatar)} />
                    <span key="login" className={clsx(styles.bar, styles.barLogin)} />
                </div>
                {field('login')}
                <span key="save" className={clsx(styles.bar, styles.barButton)} />
            </section>
            <section key="password" className={styles.section}>
                <h2 key="title" className={styles.sectionTitle}>
                    Смена пароля
                </h2>
                {field('current')}
                {field('next')}
                {field('confirm')}
                <span key="save" className={clsx(styles.bar, styles.barButton)} />
            </section>
        </div>
    );
}
