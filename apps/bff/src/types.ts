// Типы BFF для клиента: только `import type`, кода в бандл клиента не попадает
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from './router/index.ts';

export type { AppRouter };

/** Входы процедур: `RouterInputs['notebooks']['get']`. */
export type RouterInputs = inferRouterInputs<AppRouter>;

/** Ответы процедур: `RouterOutputs['notebooks']['list']`. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** Пользователь, как его отдаёт `users.me`. */
export type CurrentUser = RouterOutputs['users']['me'];

/** Данные страницы блокнота, как их отдаёт `notebooks.get`: `{ notebook }`. */
export type NotebookPageData = RouterOutputs['notebooks']['get'];

/** Блокнот с hash и ячейками. */
export type NotebookData = NotebookPageData['notebook'];

/**
 * Данные, которые BFF кладёт в `<script id="bootstrap">` первого HTML: пользователь, а на прямом
 * открытии своего блокнота — и данные страницы блокнота, как у `notebooks.get`.
 */
export type BootstrapData = { user: CurrentUser | null; notebookPage?: NotebookPageData };
