import { useEffect, useState } from '@cdd-team/react';
import { Link, useParams } from '@cdd-team/router';
import { api, isBffError, type Output } from '@api/bff';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { ConfigForm } from './ConfigForm';
import { InfoPanel } from './InfoPanel';
import styles from './KeyPage.module.css';

type KeyCard = Output<'/api/onlineconf/keys/get'>;
type CardState = { status: 'loading' | 'missing' | 'failed' } | { status: 'ready'; card: KeyCard };

/** Карточка ключа с переходом обратно к списку. */
export function KeyPage() {
    const { name } = useParams({ from: '/keys/$name' });
    return (
        <section>
            <Link key="back" className={styles.back} to="/keys">
                <Icon key="icon" name="back" size={16} />
                Все ключи
            </Link>
            <KeyDetails key={name} name={name} />
        </section>
    );
}

/** Запрашивает карточку и хранит последнее подтверждённое сервером состояние ключа. */
function KeyDetails({ name }: { name: string }) {
    const [result, setResult] = useState<CardState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        void api('GET', '/api/onlineconf/keys/get', {
            params: { query: { name } },
            init: { signal },
        }).then(
            (card) => {
                if (!signal.aborted) setResult({ status: 'ready', card });
            },
            (error) => {
                if (signal.aborted) return;
                // некорректное имя BFF отклоняет с BAD_REQUEST: повтор не поможет
                const missing =
                    isBffError(error) &&
                    (error.appCode === 'not_found' || error.code === 'BAD_REQUEST');
                setResult({ status: missing ? 'missing' : 'failed' });
            },
        );
        return () => controller.abort();
    }, [name, attempt]);

    if (result.status === 'loading') return <p aria-live="polite">Загружаем ключ…</p>;
    if (result.status === 'missing') {
        return (
            <StateBlock
                title="Ключ не найден"
                description="Проверьте имя или вернитесь к списку ключей."
            />
        );
    }
    if (result.status !== 'ready') {
        return (
            <StateBlock error title="Не удалось загрузить ключ" description="Попробуйте ещё раз.">
                <Button
                    variant="secondary"
                    onClick={() => {
                        setResult({ status: 'loading' });
                        setAttempt((value) => value + 1);
                    }}
                >
                    Повторить
                </Button>
            </StateBlock>
        );
    }

    const { card } = result;
    return (
        <>
            <div key="heading" className={styles.heading}>
                <h1 key="name" className={styles.title}>
                    {card.name}
                </h1>
                <span key="badge" className={card.type === 'config' ? styles.config : undefined}>
                    <Badge>{card.type === 'config' ? 'Конфиг' : 'Флаг'}</Badge>
                </span>
            </div>
            <div key="grid" className={styles.grid}>
                <div key="content" className={styles.panel}>
                    {card.type === 'config' ? (
                        <ConfigForm
                            key={name}
                            card={card}
                            onSaved={(updated) => setResult({ status: 'ready', card: updated })}
                        />
                    ) : (
                        <p>Редактирование флага пока недоступно</p>
                    )}
                </div>
                <InfoPanel key="info" card={card} />
            </div>
        </>
    );
}
