import { env } from './env.ts';
import type { Route } from './http.ts';

/**
 * Маршруты, которым нужны случайные данные Prism вместо примеров контракта: иначе у всех новых
 * ячеек был бы один id из примера.
 */
const DYNAMIC = new Set(['/api/cells/create']);

/**
 * Значение `Prefer` для вызовов Go маршрута с сессией, только в режиме `dev:prism`
 * (`MOCK_PREFER=1`): статус из `X-Mock-Prefer: <код>` клиента, а без него у {@link DYNAMIC} —
 * случайные данные. Код не из 100–599 пропускается.
 * @param def маршрут из таблицы
 * @param req запрос API
 * @returns заголовок `Prefer` или `undefined`
 */
export function mockPrefer(def: Route, req: Request): string | undefined {
    if (env.MOCK_PREFER !== '1' || def.access !== 'authed') return undefined;
    const code = req.headers.get('X-Mock-Prefer');
    if (code && /^[1-5]\d\d$/.test(code)) return `code=${code}`;
    return DYNAMIC.has(def.path) ? 'dynamic=true' : undefined;
}
