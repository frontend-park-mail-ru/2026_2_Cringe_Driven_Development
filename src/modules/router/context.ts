import { createContext } from '@maninthecoat/react';

import type { AnyRouter } from './router';

/** Роутер из `<RouterProvider>`; вне его — null */
export const RouterContext = createContext<AnyRouter | null>(null);

/** `id` маршрута, внутри компонента которого идёт отрисовка */
export const MatchContext = createContext<string | undefined>(undefined);
