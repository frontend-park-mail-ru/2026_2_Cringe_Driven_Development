import { PAGES } from '@cdd/bff/pages';
import { createRoute } from '@cdd-team/router';
import { ProfilePage } from '@pages/ProfilePage/ProfilePage';
import { authRoute } from './auth';

/** Страница профиля: `/profile`. */
export const profileRoute = createRoute({
    getParentRoute: () => authRoute,
    path: PAGES.profile,
    component: ProfilePage,
});
