import { indexRoute } from './index';
import { rootRoute } from './root';

export const routeTree = rootRoute.addChildren([indexRoute]);
