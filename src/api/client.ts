import createClient, { authMiddleware } from '@iredtea/openapi';
import type { components, paths } from './schema';

/** Пользователь (схема User в Apidog). */
export type User = components['schemas']['User'];

/** Логин и пароль (схема Credentials в Apidog). */
export type Credentials = components['schemas']['Credentials'];

/** Код ошибки из ответа бэкенда (схема Error в Apidog). */
export type ApiErrorCode = components['schemas']['Error']['code'];

/**
 * Клиент бэкенда.
 * authMiddleware хранит access-токен в памяти и после 401 обновляет его по refresh-cookie.
 */
export const api = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });

api.use(authMiddleware());
