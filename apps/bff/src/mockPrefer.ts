/**
 * Разбирает `X-Mock-Prefer: <процедура>=<код>[,<процедура>=<код>]` клиента в режиме `dev:prism`.
 * Пара с кодом не из 100–599 пропускается.
 * @param header значение заголовка или `null`
 * @returns код ответа локального мока по имени процедуры tRPC
 */
export function parseMockPrefer(header: string | null): Map<string, number> {
    const rules = new Map<string, number>();
    for (const pair of header?.split(',') ?? []) {
        const [path, code] = pair.trim().split('=');
        if (!path || !code || !/^\d{3}$/.test(code)) continue;
        const status = Number(code);
        if (status >= 100 && status <= 599) rules.set(path, status);
    }
    return rules;
}

// Prism запускается в статическом режиме (примеры контракта); случайные данные нужны только
// созданию ячейки — иначе у всех новых ячеек был бы один id из примера
const DYNAMIC = new Set(['cells.create']);

/**
 * Значение `Prefer` для вызовов Go процедуры в режиме `dev:prism`.
 * @param path имя процедуры tRPC
 * @param code статус из `X-Mock-Prefer` или `undefined`
 * @returns значение заголовка или `undefined`
 */
export function mockPreferHeader(path: string, code: number | undefined): string | undefined {
    if (code !== undefined) return `code=${code}`;
    return DYNAMIC.has(path) ? 'dynamic=true' : undefined;
}
