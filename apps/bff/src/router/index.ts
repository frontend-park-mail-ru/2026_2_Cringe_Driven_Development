import { router } from '../trpc.ts';
import { auth } from './auth.ts';
import { cells } from './cells.ts';
import { notebooks } from './notebooks.ts';
import { runtime } from './runtime.ts';
import { twoFactor } from './twoFactor.ts';
import { users } from './users.ts';

/** Роутер BFF: процедуры названы по ресурсам Go. */
export const appRouter = router({ auth, users, twoFactor, notebooks, cells, runtime });

/** Тип роутера для клиента tRPC. */
export type AppRouter = typeof appRouter;
