/**
 * Процент раскатки из текста поля.
 * @returns целое 0–100 или undefined
 */
export function parsePercent(text: string): number | undefined {
    const value = /^\d{1,3}$/.test(text) ? Number(text) : undefined;
    return value !== undefined && value <= 100 ? value : undefined;
}
