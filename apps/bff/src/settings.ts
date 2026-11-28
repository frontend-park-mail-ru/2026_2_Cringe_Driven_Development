import type { OnlineConfMe } from '@cdd/schemas/types';

import type { Go } from './go/api.ts';
import { GoError } from './go/errors.ts';

/**
 * Настройки OnlineConf для bootstrap: сбой OnlineConf (ответ с ошибкой, в том числе просроченный
 * снимок, сеть, ответ не по протоколу) — `null`, «настройки недоступны», а не ошибка страницы.
 * Конец сессии и прочие ошибки пробрасываются, как у остальных вызовов HTML.
 * @param go клиент Go сессии
 * @returns настройки или `null`
 */
export const loadSettings = (go: Pick<Go, 'getOnlineConfMe'>): Promise<OnlineConfMe | null> =>
    go.getOnlineConfMe().catch((err: unknown) => {
        if (err instanceof GoError) return null;
        throw err;
    });
