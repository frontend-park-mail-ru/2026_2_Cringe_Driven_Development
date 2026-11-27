import { PAGES } from '@cdd/bff/pages';
import { createRoute } from '@cdd-team/router';
import { UiKitPage } from '@pages/UiKitPage/UiKitPage';
import { authRoute } from './auth';

/** Витрина компонентов: `/ui-kit`. */
export const uiKitRoute = createRoute({
    getParentRoute: () => authRoute,
    path: PAGES.uiKit,
    component: UiKitPage,
});
