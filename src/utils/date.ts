import { plural } from './plural';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dayMonth = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});

/**
 * Сколько назад было время: «только что», «5 мин назад», «2 ч назад», «вчера», «3 дня назад»,
 * дальше недели — дата.
 * @param iso время в формате ISO 8601
 * @param now текущее время
 * @returns текст для подписи «изменён …»
 */
export function timeAgo(iso: string, now = new Date()): string {
    const date = new Date(iso);
    const diff = now.getTime() - date.getTime();
    if (diff < MINUTE) return 'только что';
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)} мин назад`;
    if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} ч назад`;

    const startOfDay = (value: Date) =>
        new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(date)) / (24 * HOUR));
    if (days <= 1) return 'вчера';
    if (days < 7) return `${plural(days, 'день', 'дня', 'дней')} назад`;

    return date.getFullYear() === now.getFullYear()
        ? dayMonth.format(date)
        : dayMonthYear.format(date);
}
