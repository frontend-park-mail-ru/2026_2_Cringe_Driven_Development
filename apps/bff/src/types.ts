// Типы BFF для клиента: только `import type`, кода в бандл клиента не попадает
import type { User } from '@cdd/schemas/types';

import type { NotebookPage } from './notebook.ts';

export type { BffPaths } from './router/index.ts';
export type { ApiErrorBody, ErrorCode, ValidationErrors } from './errors.ts';

/**
 * Данные, которые BFF кладёт в `<script id="bootstrap">` первого HTML: пользователь, как у
 * `users/me`, а на прямом открытии своего блокнота — и данные страницы, как у `notebooks/get`.
 */
export type BootstrapData = { user: User | null; notebookPage?: NotebookPage };
