import { createRouter } from './modules/router';
import { routeTree } from './routes/routeTree';

export const router = createRouter({ routeTree });

declare module './modules/router' {
    interface Register {
        router: typeof router;
    }
}
