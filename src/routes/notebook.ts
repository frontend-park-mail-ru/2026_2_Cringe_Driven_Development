import { createRoute } from '@modules/router';
import { NotebookPage } from '@pages/NotebookPage/NotebookPage';
import { authRoute } from './auth';

/** Страница блокнота: `/notebooks/$notebookId`. */
export const notebookRoute = createRoute({
    getParentRoute: () => authRoute,
    path: 'notebooks/$notebookId',
    component: NotebookPage,
});
