/**
 * Форма слова для числа: 1 блокнот, 2 блокнота, 5 блокнотов.
 * @param {number} count число
 * @param {string} one форма для 1, 21, 31…
 * @param {string} few форма для 2–4, 22–24…
 * @param {string} many форма для 0, 5–20, 25–30…
 * @returns {string} число и слово через пробел
 */
export function plural(count: number, one: string, few: string, many: string): string {
    const last = count % 10;
    const lastTwo = count % 100;
    if (last === 1 && lastTwo !== 11) return `${count} ${one}`;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} ${few}`;
    return `${count} ${many}`;
}
