import { createContext } from '@maninthecoat/react';

import type { AnyRouter } from './router';

export const RouterContext = createContext<AnyRouter | null>(null);

/** `id` маршрута, внутри компонента которого идёт отрисовка */
export const MatchContext = createContext<string | undefined>(undefined);
