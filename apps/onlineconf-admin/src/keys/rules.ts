/**
 * Процент раскатки из текста поля.
 * @returns целое 0–100 или undefined
 */
export function parsePercent(text: string): number | undefined {
    const value = /^\d{1,3}$/.test(text) ? Number(text) : undefined;
    return value !== undefined && value <= 100 ? value : undefined;
}

/**
 * Запрос поиска пользователя по введённому тексту: только цифры — ID, иначе логин.
 * @returns undefined для пустого и заведомо неверного ввода
 */
export function userQuery(text: string): { id: number } | { login: string } | undefined {
    const value = text.trim();
    if (/^\d+$/.test(value)) {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? { id } : undefined;
    }
    return value && value.length <= 32 ? { login: value } : undefined;
}
