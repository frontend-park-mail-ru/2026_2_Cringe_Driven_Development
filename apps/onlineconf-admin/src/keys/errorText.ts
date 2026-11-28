import { isBffError } from '@api/bff';

/**
 * Текст отказа для пользователя по коду ошибки: `message` BFF — технический.
 * @param error пойманная ошибка
 * @param fallback текст для сбоя сети, сервера и прочих отказов
 */
export function errorText(error: unknown, fallback: string): string {
    if (!isBffError(error)) return fallback;
    if (error.appCode === 'not_found') return 'Ключ не найден: возможно, его удалили.';
    if (error.appCode === 'forbidden') return 'Нет прав администратора OnlineConf.';
    if (error.code === 'BAD_REQUEST') return 'Сервер отклонил данные. Проверьте поля.';
    if (error.code === 'PAYLOAD_TOO_LARGE') return 'Слишком большой объём данных.';
    return fallback;
}
