import { authRoute } from './auth';
import { guestRoute, loginRoute, registerRoute } from './guest';
import { indexRoute } from './index';
import { notebookRoute } from './notebook';
import { notFoundRoute } from './notFound';
import { profileRoute } from './profile';
import { rootRoute } from './root';

/** Дерево маршрутов: страницы гостя (`_guest`), вошедшего пользователя (`_auth`) и `/404`. */
export const routeTree = rootRoute.addChildren([
    guestRoute.addChildren([loginRoute, registerRoute]),
    authRoute.addChildren([indexRoute, notebookRoute, profileRoute]),
    notFoundRoute,
]);
