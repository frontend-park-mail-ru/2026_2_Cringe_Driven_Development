import { createRoute } from '../modules/router';
import { HomePage } from '../pages/HomePage';
import { rootRoute } from './root';

export const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
});
