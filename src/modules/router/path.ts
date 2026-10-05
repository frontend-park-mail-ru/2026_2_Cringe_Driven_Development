/** Параметры пути из адреса: имя → значение. */
export type Params = Record<string, string>;
/** Значения параметров для подстановки в шаблон пути. */
export type ParamValues = Record<string, string | number>;
/** Разобранные search-параметры адреса. */
export type Search = Record<string, unknown>;

const SPLAT_SEGMENT = '$';
const SPLAT_PARAM = '_splat';

/**
 * Делит путь на непустые сегменты.
 * @param {string} path путь
 * @returns {string[]} сегменты
 */
export function splitPath(path: string): string[] {
    return path.split('/').filter(Boolean);
}

/**
 * Склеивает части в абсолютный путь без дублирующихся и завершающих слэшей.
 * @param {string[]} paths части пути
 * @returns {string} абсолютный путь
 */
export function joinPaths(...paths: string[]): string {
    return `/${paths.flatMap(splitPath).join('/')}`;
}

/**
 * Разрешает `to` относительно `base`: поддерживает абсолютные пути, `.` и `..`
 * @param {string} base путь, от которого считать
 * @param {string} to абсолютный или относительный путь
 * @returns {string} абсолютный путь
 */
export function resolvePath(base: string, to: string): string {
    if (to.startsWith('/')) return joinPaths(to);

    const segments = splitPath(base);
    for (const segment of splitPath(to)) {
        if (segment === '.') continue;
        if (segment === '..') segments.pop();
        else segments.push(segment);
    }

    return joinPaths(...segments);
}

/**
 * Сопоставляет шаблон вида `/users/$userId` с адресом.
 * @param {string} pattern шаблон пути
 * @param {string} pathname путь адреса
 * @returns {Params | undefined} параметры пути или `undefined`, если адрес не подошёл
 */
export function matchPath(pattern: string, pathname: string): Params | undefined {
    const patternSegments = splitPath(pattern);
    const pathSegments = splitPath(pathname).map(decodeSegment);
    const params: Params = {};

    for (const [index, segment] of patternSegments.entries()) {
        if (segment === SPLAT_SEGMENT) {
            params[SPLAT_PARAM] = pathSegments.slice(index).join('/');
            return params;
        }

        const value = pathSegments[index];
        if (value === undefined) return undefined;

        if (segment.startsWith('$')) params[segment.slice(1)] = value;
        else if (segment.toLowerCase() !== value.toLowerCase()) return undefined;
    }

    return patternSegments.length === pathSegments.length ? params : undefined;
}

/**
 * Подставляет параметры в шаблон пути, сохраняя относительные сегменты.
 * @param {string} pattern шаблон пути
 * @param {ParamValues} params значения параметров
 * @returns {string} путь
 */
export function interpolatePath(pattern: string, params: ParamValues): string {
    return pattern
        .split('/')
        .map((segment) => {
            if (!segment.startsWith('$')) return segment;

            const name = segment === SPLAT_SEGMENT ? SPLAT_PARAM : segment.slice(1);
            const value = params[name];
            if (value === undefined) {
                throw new Error(`Не передан параметр "${name}" для пути "${pattern}"`);
            }

            // Слэш разделяет сегменты только в сплате: в обычном параметре он часть значения
            return segment === SPLAT_SEGMENT
                ? encodeSegments(String(value))
                : encodeURIComponent(String(value));
        })
        .join('/');
}

/**
 * Приводит кодирование сегментов пути к тому виду, в котором его собирает `interpolatePath`.
 * @param {string} pathname путь адреса
 * @returns {string} путь в едином кодировании
 */
export function normalizePath(pathname: string): string {
    return joinPaths(encodeSegments(splitPath(pathname).map(decodeSegment).join('/')));
}

/**
 * Сравнивает шаблоны по специфичности: статичный сегмент важнее параметра,
 * параметр важнее сплата.
 * @param {string} a первый шаблон
 * @param {string} b второй шаблон
 * @returns {number} отрицательное число, если первым идёт `a`, положительное — если `b`
 */
export function comparePatterns(a: string, b: string): number {
    const aSegments = splitPath(a);
    const bSegments = splitPath(b);

    for (let index = 0; index < Math.min(aSegments.length, bSegments.length); index += 1) {
        const diff = segmentScore(bSegments[index]!) - segmentScore(aSegments[index]!);
        if (diff !== 0) return diff;
    }

    return aSegments.length - bSegments.length;
}

/**
 * Разбирает строку search-параметров: значения читаются как JSON, повторяющийся ключ даёт массив.
 * @param {string} searchStr строка запроса, с ведущим `?` или без
 * @returns {Search} search-параметры
 */
export function parseSearch(searchStr: string): Search {
    // Собираем в Map: у объекта ключи вроде `toString` и `__proto__` попали бы в прототип
    const values = new Map<string, unknown>();

    for (const [key, raw] of new URLSearchParams(searchStr)) {
        const value = parseSearchValue(raw);
        const existing = values.get(key);

        if (!values.has(key)) values.set(key, value);
        else if (Array.isArray(existing)) existing.push(value);
        else values.set(key, [existing, value]);
    }

    return Object.fromEntries(values);
}

/**
 * Обратная к `parseSearch`: не-строки пишутся как JSON, так что типы значений переживают
 * перезагрузку.
 * @param {Search} search search-параметры
 * @returns {string} строка с ведущим `?` или пустая, если параметров нет
 */
export function stringifySearch(search: Search): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(search)) {
        if (value === undefined) continue;
        query.append(key, stringifySearchValue(value));
    }

    const searchStr = query.toString();
    return searchStr ? `?${searchStr}` : '';
}

function segmentScore(segment: string): number {
    if (segment === SPLAT_SEGMENT) return 1;
    return segment.startsWith('$') ? 2 : 3;
}

function encodeSegments(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
}

function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

function parseSearchValue(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function stringifySearchValue(value: unknown): string {
    if (typeof value !== 'string') return JSON.stringify(value);
    // Строку, похожую на JSON ("42", "true"), берём в кавычки, иначе при разборе она сменит тип
    return parseSearchValue(value) === value ? value : JSON.stringify(value);
}
