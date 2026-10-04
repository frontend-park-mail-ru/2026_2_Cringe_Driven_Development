import { createRoute } from '@modules/router';
import { HomePage } from '@pages/HomePage';
import { authRoute } from './auth';

export const indexRoute = createRoute({
    getParentRoute: () => authRoute,
    path: '/',
    component: HomePage,
});
