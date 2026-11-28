import {
    createOnlineConfKeyInput,
    deleteOnlineConfKeyInput,
    getOnlineConfKeyInput,
    listOnlineConfKeysInput,
    resolveOnlineConfUserInput,
    updateOnlineConfKeyInput,
} from '@cdd/schemas/validate';

import { route } from '../http.ts';

/**
 * Админка OnlineConf от имени пользователя сессии: роль проверяет OnlineConf по Identity, поэтому
 * без роли — `403` с `appCode: forbidden`, без сессии — `401`; сессию отказ по роли не завершает.
 * Ключ задаёт полное имя; коды отказов OnlineConf (`validation_error`, `not_found`,
 * `key_name_taken`) приходят в `appCode`.
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
        handle: ({ go }, input) => go.getOnlineConfKey(input.name),
    }),
    route({
        method: 'POST',
        path: '/api/onlineconf/keys/create',
        access: 'authed',
        input: { from: 'json', validate: createOnlineConfKeyInput },
        handle: ({ go }, input) => go.createOnlineConfKey(input),
    }),
    /** Редактируемые поля заменяются целиком; `type` выбирает их набор и в OnlineConf не уходит. */
    route({
        method: 'POST',
        path: '/api/onlineconf/keys/update',
        access: 'authed',
        input: { from: 'json', validate: updateOnlineConfKeyInput },
        handle: ({ go }, { name, type: _type, ...key }) => go.updateOnlineConfKey(name, key),
    }),
    route({
        method: 'POST',
        path: '/api/onlineconf/keys/delete',
        access: 'authed',
        input: { from: 'json', validate: deleteOnlineConfKeyInput },
        handle: ({ go }, input) => go.deleteOnlineConfKey(input.name),
    }),
    route({
        method: 'GET',
        path: '/api/onlineconf/users/resolve',
        access: 'authed',
        input: { from: 'query', validate: resolveOnlineConfUserInput },
        handle: ({ go }, input) => go.resolveOnlineConfUser(input),
    }),
    /**
     * Публичные настройки продукта без админской роли: решение флага считает OnlineConf для
     * пользователя сессии; просроченный снимок (`503`) — `502`, а не прежнее значение.
     */
    route({
        method: 'GET',
        path: '/api/onlineconf/me',
        access: 'authed',
        handle: ({ go }) => go.getOnlineConfMe(),
    }),
] as const;
