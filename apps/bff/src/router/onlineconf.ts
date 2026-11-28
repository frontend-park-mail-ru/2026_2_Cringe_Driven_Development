import {
    getOnlineConfKeyInput,
    listOnlineConfKeysInput,
    onlineConfKeyInput,
} from '@cdd/schemas/validate';

import { route } from '../http.ts';

/**
 * Админка OnlineConf от имени пользователя сессии: роль проверяет OnlineConf по Identity, поэтому
 * без роли — `403` с `appCode: forbidden`, без сессии — `401`; сессию отказ по роли не завершает.
 */
export const onlineconf = [
    route({
        method: 'GET',
        path: '/api/onlineconf/access',
        access: 'authed',
        handle: ({ go }) => go.getOnlineConfAccess(),
    }),
    route({
        method: 'GET',
        path: '/api/onlineconf/keys/list',
        access: 'authed',
        input: { from: 'query', validate: listOnlineConfKeysInput },
        handle: ({ go }, input) => go.listOnlineConfKeys(input),
    }),
    route({
        method: 'GET',
        path: '/api/onlineconf/keys/get',
        access: 'authed',
        input: { from: 'query', validate: getOnlineConfKeyInput },
        handle: ({ go }, input) => go.getOnlineConfKey(input.scope, input.name),
    }),
    route({
        method: 'POST',
        path: '/api/onlineconf/keys/create',
        access: 'authed',
        input: { from: 'json', validate: onlineConfKeyInput },
        handle: ({ go }, input) => go.createOnlineConfKey(input),
    }),
    /** Значение заменяется целиком; вид ключа не меняется (`409 conflict`). */
    route({
        method: 'POST',
        path: '/api/onlineconf/keys/update',
        access: 'authed',
        input: { from: 'json', validate: onlineConfKeyInput },
        handle: ({ go }, input) => go.updateOnlineConfKey(input),
    }),
] as const;
