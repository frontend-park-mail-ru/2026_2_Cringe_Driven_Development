import type { PathsOf } from '../http.ts';
import { auth } from './auth.ts';
import { cells } from './cells.ts';
import { notebooks } from './notebooks.ts';
import { runtime } from './runtime.ts';
import { twoFactor } from './twoFactor.ts';
import { users } from './users.ts';

/** Таблица HTTP-маршрутов BFF: один источник метода, пути, входа и ответа. */
export const routes = [
    ...auth,
    ...users,
    ...twoFactor,
    ...notebooks,
    ...cells,
    ...runtime,
] as const;

/** Карта операций BFF для общего клиента: `createClient<BffPaths>`. */
export type BffPaths = PathsOf<(typeof routes)[number]>;
