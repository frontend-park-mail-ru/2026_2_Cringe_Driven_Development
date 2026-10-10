import { RootLayout } from '@layouts/RootLayout';
import { createRootRoute } from '@modules/router';
import { NotFoundPage } from '@pages/NotFoundPage';

/** Корневой маршрут: общий макет и страница «Не найдено». */
export const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: NotFoundPage,
});
