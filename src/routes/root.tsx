import { RootLayout } from '../layouts/RootLayout';
import { createRootRoute } from '../modules/router';
import { NotFoundPage } from '../pages/NotFoundPage';

export const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: NotFoundPage,
});
