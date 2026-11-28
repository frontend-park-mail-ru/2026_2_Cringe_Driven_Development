import { Outlet } from '@cdd-team/router';
import { useEffect, useRef, useState } from '@cdd-team/react';
import { api, isBffError, onSessionLost } from '@api/bff';
import { buttonClassName } from '@components/Button/Button';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { AdminHeader } from './AdminHeader';
import styles from './AdminHeader.module.css';

/** Результат проверки доступа к OnlineConf. */
type Access = 'loading' | 'granted' | 'guest' | 'denied' | 'failed';

/** Преобразует результат проверки доступа в состояние страницы. */
async function checkAccess(signal: AbortSignal): Promise<Access> {
    try {
        await api('GET', '/api/onlineconf/access', { init: { signal } });
        return 'granted';
    } catch (error) {
        if (isBffError(error)) {
            if (error.code === 'UNAUTHORIZED') return 'guest';
            if (error.code === 'FORBIDDEN' && error.appCode === 'forbidden') return 'denied';
        }
        return 'failed';
    }
}

/** Отображает состояние входа или защищённые страницы админки. */
export function AccessGate() {
    const [access, setAccess] = useState<Access>('loading');
    const anchor = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        onSessionLost(() => setAccess('guest'));
        void checkAccess(controller.signal).then((result) => {
            if (!controller.signal.aborted) setAccess(result);
        });
        return () => {
            controller.abort();
            onSessionLost(() => {});
        };
    }, []);

    return (
        <div className={styles.layout}>
            <Space key="space" anchor={anchor} edge="above" />
            <AdminHeader key="header" granted={access === 'granted'} />
            <main key="main" className={styles.main}>
                <div ref={anchor} className={styles.anchor} aria-hidden="true" />
                {access === 'granted' ? (
                    <Outlet key="page" />
                ) : (
                    <div key="access" className={styles.access}>
                        {access === 'loading' && <p aria-live="polite">Проверяем доступ…</p>}
                        {access === 'guest' && (
                            <StateBlock
                                title="Войти в OnlineConf"
                                description="Войдите в Cellestial, чтобы открыть OnlineConf."
                            >
                                <a className={buttonClassName('primary')} href="/login">
                                    Войти
                                </a>
                            </StateBlock>
                        )}
                        {access === 'denied' && (
                            <StateBlock
                                error
                                title="Нет доступа к админке"
                                description="У вашей учётной записи нет прав администратора OnlineConf. Попросите доступ у владельца проекта."
                            >
                                <a className={buttonClassName('secondary')} href="/">
                                    Вернуться в Cellestial
                                </a>
                            </StateBlock>
                        )}
                        {access === 'failed' && (
                            <StateBlock
                                error
                                title="Не удалось проверить доступ"
                                description="Обновите страницу позже."
                            />
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
