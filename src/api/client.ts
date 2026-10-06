import createClient from '@iredtea/openapi';
import { authMiddleware } from './auth';
import type { components, paths } from './schema';

/** Пользователь (схема User в Apidog). */
export type User = components['schemas']['User'];

/** Логин и пароль (схема Credentials в Apidog). */
export type Credentials = components['schemas']['Credentials'];

/** Код ошибки из ответа бэкенда (схема Error в Apidog). */
export type ApiErrorCode = components['schemas']['Error']['code'];

/** Блокнот в списке (схема NotebookSummary в Apidog). */
export type NotebookSummary = components['schemas']['NotebookSummary'];

/** Блокнот с ячейками (схема Notebook в Apidog). */
export type Notebook = components['schemas']['Notebook'];

/** Ячейка блокнота (схема Cell в Apidog). */
export type Cell = components['schemas']['Cell'];

/**
 * Клиент бэкенда.
 * Токены живут в HttpOnly-cookie, браузер отправляет их сам; после 401 клиент обновляет их
 * по refresh-cookie.
 */
export const api = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });

api.use(authMiddleware());
