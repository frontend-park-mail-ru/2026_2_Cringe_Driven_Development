import { createRoute } from '@modules/router';
import { NotebooksPage } from '@pages/NotebooksPage/NotebooksPage';
import { authRoute } from './auth';

/** Главная: список блокнотов. */
export const indexRoute = createRoute({
    getParentRoute: () => authRoute,
    path: '/',
    component: NotebooksPage,
});
