import { PAGES } from '@cdd/bff/pages';
import { createRoute } from '@cdd-team/router';
import { EmbedPreviewPage } from '@pages/EmbedPreviewPage/EmbedPreviewPage';
import { authRoute } from './auth';

/** Пример встраиваемой страницы: `/embed/preview`. */
export const embedPreviewRoute = createRoute({
    getParentRoute: () => authRoute,
    path: PAGES.embedPreview,
    component: EmbedPreviewPage,
});
