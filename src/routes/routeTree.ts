import { authRoute } from './auth';
import { guestRoute, loginRoute, registerRoute } from './guest';
import { indexRoute } from './index';
import { notebookRoute } from './notebook';
import { rootRoute } from './root';

export const routeTree = rootRoute.addChildren([
    guestRoute.addChildren([loginRoute, registerRoute]),
    authRoute.addChildren([indexRoute, notebookRoute]),
]);
