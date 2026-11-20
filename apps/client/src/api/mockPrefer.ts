// Только для bun run dev:prism: в production-сборке вызовы стоят под VITE_MOCK_PREFER и удаляются

/** Одноразовые статусы по пути маршрута API: следующий его вызов получит этот ответ мока. */
const rules = new Map<string, number>();

/**
 * Следующий запрос к этому маршруту получит от локального мока Go ответ с этим статусом. Работает
 * для маршрутов с сессией: BFF передаёт `Prefer` только им.
 * @param path путь маршрута API, например `/api/cells/update`
 * @param code HTTP-статус от 100 до 599
 */
export function mock(path: string, code: number): void {
    if (!path.startsWith('/api/') || !Number.isInteger(code) || code < 100 || code > 599) {
        throw new RangeError('mock(путь, статус): путь — /api/…, статус — целое от 100 до 599');
    }
    rules.set(path, code);
}

/**
 * Снимает правило для маршрута запроса.
 * @param path путь маршрута без query
 * @returns значение заголовка `X-Mock-Prefer` (статус) или `undefined`, если правила нет
 */
export function takeMockPrefer(path: string): string | undefined {
    const code = rules.get(path);
    if (code === undefined) return undefined;
    rules.delete(path);
    return String(code);
}

/** Делает `mock(путь, статус)` доступной из консоли браузера. */
export function installMockCommand(): void {
    Object.assign(window, { mock });
}
