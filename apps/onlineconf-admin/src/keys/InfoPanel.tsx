import type { Output } from '@api/bff';
import { Avatar } from '@components/Avatar/Avatar';
import { plural } from '@utils/plural';
import styles from './KeyPage.module.css';

type KeyCard = Output<'/api/onlineconf/keys/get'>;

const date = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });
const time = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });

/** Метаданные ключа и авторы создания и последнего изменения. */
export function InfoPanel({ card }: { card: KeyCard }) {
    return (
        <aside className={styles.panel} aria-labelledby="key-info-title">
            <h2 key="title" id="key-info-title" className={styles.infoTitle}>
                Информация
            </h2>
            <dl key="details" className={styles.info}>
                <div key="scope">
                    <dt key="label">Скоуп</dt>
                    <dd key="value">{card.scope}</dd>
                </div>
                {card.type === 'flag' && <Reach key="reach" card={card} />}
                {card.type === 'config' && (
                    <div key="format">
                        <dt key="label">Формат</dt>
                        <dd key="value">{card.format.toUpperCase()}</dd>
                    </div>
                )}
                <Author
                    key="created"
                    label="Создал"
                    login={card.created_by.login}
                    timestamp={card.created_at}
                />
                <Author
                    key="updated"
                    label="Обновил"
                    login={card.updated_by.login}
                    timestamp={card.updated_at}
                />
            </dl>
        </aside>
    );
}

/** Кому включён флаг по сохранённым настройкам; это не статистика запросов. */
function Reach({ card }: { card: Extract<KeyCard, { type: 'flag' }> }) {
    const { enabled, rollout_percent: percent, include_users, exclude_users } = card;
    const manual = `+ ${include_users.length} вручную`;
    const excluded = plural(exclude_users.length, 'исключён', 'исключены', 'исключено');
    return (
        <div>
            <dt key="label">Сейчас включён у</dt>
            <dd key="value">{enabled ? `${percent}% пользователей` : 'Никого: флаг выключен'}</dd>
            <dd key="details">
                {enabled ? `${manual} · ${excluded}` : `настроено ${percent}% ${manual}`}
            </dd>
        </div>
    );
}

/** Автор и дата одного из событий карточки. */
function Author({ label, login, timestamp }: { label: string; login: string; timestamp: string }) {
    const instant = new Date(timestamp);
    return (
        <div>
            <dt key="label">{label}</dt>
            <dd key="value" className={styles.author}>
                <Avatar key="avatar" login={login} className={styles.avatar} />
                <span key="text">
                    {login} · {date.format(instant)}, {time.format(instant)}
                </span>
            </dd>
        </div>
    );
}
