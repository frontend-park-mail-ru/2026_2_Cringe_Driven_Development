import { createRoute } from '@modules/router';
import { NotebookPage } from '@pages/NotebookPage/NotebookPage';
import { authRoute } from './auth';

export const notebookRoute = createRoute({
    getParentRoute: () => authRoute,
    path: 'notebooks/$notebookId',
    component: NotebookPage,
});
