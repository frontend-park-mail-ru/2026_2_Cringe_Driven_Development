/** Значение, из которого {@link clsx} собирает классы. */
export type ClassValue =
    | ClassArray
    | ClassDictionary
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined;

/** Объект: ключ попадает в классы, если его значение истинно. */
export type ClassDictionary = Record<string, unknown>;

/** Вложенный список значений. */
export type ClassArray = ClassValue[];

/**
 * Превращает одно значение в строку классов.
 * @param value строка, число, массив или объект
 * @returns строка классов (может быть пустой)
 */
function toClassName(value: ClassValue): string {
    if (!value || value === true) {
        return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return clsx(...value);
    }
    return clsx(...Object.keys(value).filter((key) => value[key]));
}

/**
 * Собирает строку классов, пропуская ложные значения.
 * @example clsx('button', { 'button--block': false }) // 'button'
 * @param values строки, числа, массивы и объекты вида `{ класс: условие }`
 * @returns классы через пробел
 */
export function clsx(...values: ClassValue[]): string {
    let result = '';
    for (const value of values) {
        const className = toClassName(value);
        if (className) {
            result = result ? `${result} ${className}` : className;
        }
    }
    return result;
}
