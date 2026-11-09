// Только для bun run dev:prism: в production-сборке вызовы стоят под VITE_MOCK_PREFER и удаляются

/** Одноразовые статусы по имени процедуры tRPC: следующий её вызов получит этот ответ мока. */
const rules = new Map<string, number>();

/**
 * Следующий запрос с этой процедурой получит от локального мока Go ответ с этим статусом. Работает
 * для процедур с сессией: BFF передаёт `Prefer` только им.
 * @param path имя процедуры tRPC, например `cells.update`
 * @param code HTTP-статус от 100 до 599
 */
export function mock(path: string, code: number): void {
    if (!path || !Number.isInteger(code) || code < 100 || code > 599) {
        throw new RangeError('mock(процедура, статус): статус — целое от 100 до 599');
    }
    rules.set(path, code);
}

/**
 * Снимает правила для процедур батча.
 * @param paths имена процедур в HTTP-запросе
 * @returns значение заголовка `X-Mock-Prefer` или `undefined`, если правил нет
 */
export function takeMockPrefer(paths: string[]): string | undefined {
    const pairs: string[] = [];
    for (const path of paths) {
        const code = rules.get(path);
        if (code === undefined) continue;
        rules.delete(path);
        pairs.push(`${path}=${code}`);
    }
    return pairs.length > 0 ? pairs.join(',') : undefined;
}

/** Делает `mock(процедура, статус)` доступной из консоли браузера. */
export function installMockCommand(): void {
    Object.assign(window, { mock });
}
