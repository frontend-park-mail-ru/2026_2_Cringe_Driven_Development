---
type: concept
title: "Сессия, CSRF и смена пользователя"
description: "Граница cookie на BFF, обновление токенов Go и порядок операций смены сессии в браузере."
tags: [auth, session, csrf, bff]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-2189d746259f9de2b75640e0
    resource: repo://apps/bff/src/context.ts
  - id: openwiki-source-68c1b089f7e6c588dc622cc7
    resource: repo://apps/bff/src/go/api.ts
  - id: openwiki-source-e9d516dc0dab591185bbeeb4
    resource: repo://apps/bff/src/router/auth.ts
  - id: openwiki-source-e13a38cf859a665445e386cf
    resource: repo://apps/bff/src/router/users.ts
  - id: openwiki-source-c9e5827e8201daf3ae7859a0
    resource: repo://apps/bff/src/session/cookies.ts
  - id: openwiki-source-f291dbfb7f54acefab7789f1
    resource: repo://apps/bff/src/session/crypto.ts
  - id: openwiki-source-9ef97c8f583ba7c0596f50ab
    resource: repo://apps/bff/src/session/refresh.ts
  - id: openwiki-source-4fa129eae81b89c6a34439f3
    resource: repo://apps/bff/src/session/session.ts
  - id: openwiki-source-b078c46af746a6b2d1e173d3
    resource: repo://apps/client/src/api/trpc.ts
  - id: openwiki-source-bf47c30b7933f3e39a4ad225
    resource: repo://apps/client/src/main.tsx
  - id: openwiki-source-5788d128267fc182c2c8cd90
    resource: repo://apps/client/src/stores/session.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Сессия, CSRF и смена пользователя

## Состояние сессии

BFF хранит пару токенов Go и сроки в cookie `__Host-Http-session` с `Path=/`, `HttpOnly`, `Secure` и `SameSite=Lax`. Содержимое шифруется AES-GCM со случайным IV. Если cookie повреждена или истёк refresh, BFF планирует её удаление без вызова Go. Вход и регистрация возвращают браузеру пользователя, а токены передают `session.start`. Клиент хранит статус `guest | authed` и данные пользователя из [bootstrap](../architecture/request-flow.md). [cookies.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/cookies.ts#L1-L35), [crypto.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/crypto.ts#L16-L34), [session.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/session.ts#L141-L154), [auth.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/auth.ts#L10-L22), [стор клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/session.ts#L5-L30).

## Проверка RPC и refresh

Каждый RPC требует `X-CSRF: 1`. POST также требует `Origin`, равный `APP_ORIGIN`, и проверяет присутствующий `Sec-Fetch-Site` на `same-origin`. Отказ даёт `FORBIDDEN` с `appCode: csrf_invalid` до чтения cookie. Клиент ставит заголовок и отправляет запрос с `credentials: 'same-origin'`. [context.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/context.ts#L19-L43), [trpc.ts клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/api/trpc.ts#L137-L169).

`session.call` обновляет access, если до истечения меньше 30 секунд, добавляет Bearer и `X-Request-ID`. После 401 делает refresh и один повтор. Повторный 401 завершает сессию. Вызов может пометить 401 как отказ операции, например `invalid_totp` при подтверждении 2FA, и вернуть его без реактивного refresh. Ошибки обновления сохраняют сессию, кроме `SessionEnded`. Итоговое решение по cookie применяется в `finally` middleware. [session.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/session.ts#L13-L16), [вызов и cookie](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/session.ts#L82-L109), [заголовки и refresh](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/session.ts#L115-L137), [2FA](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L316-L329), [middleware](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/trpc.ts#L32-L41).

`refreshTokens` объединяет запросы с одинаковым refresh по его SHA-256 в памяти процесса. Успешный результат хранится 10 секунд, отклонённый промис удаляется сразу. Go 401 при refresh даёт `SessionEnded`. [refresh.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/refresh.ts#L17-L19), [refreshTokens](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/refresh.ts#L36-L69).

## Очередь смены сессии

Вход, регистрация, выход, выход со всех устройств и смена пароля идут через `switchSession`. Он последовательно запускает операции, отклоняет новые обычные защищённые запросы и ждёт уже запущенные перед операцией смены. Их `Set-Cookie` применяется раньше новой cookie. Ответы другого поколения отклоняются как `SESSION_CHANGED`. При `UNAUTHORIZED` текущего поколения транспорт вызывает обработчик потери сессии, который очищает стор и ведёт на вход. Во время смены `UNAUTHORIZED` сохраняется как признак потери сессии на случай неуспеха операции. Сами `users.changePassword` и `auth.logoutAll` также могут установить этот признак. [trpc.ts клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/api/trpc.ts#L37-L135), [switchSession](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/api/trpc.ts#L190-L230), [main.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/main.tsx#L33-L38).

## Выход в браузере и отзыв в Go

`auth.logout` удаляет cookie при любом результате обращения к Go и возвращает `browserSession: 'ended'` и `serverRevocation`. С действующим access BFF делает один `POST /auth/logout` без refresh и повторов. При истёкшем access Go пропускается. [auth.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/auth.ts#L23-L35), [session.revocation](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/session.ts#L63-L71), [go/api.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L289-L309).

| `serverRevocation` | Условие |
| --- | --- |
| `confirmed` | Go ответил 204 |
| `unconfirmed` | Access истёк или Go ответил 4xx |
| `unknown` | Сетевой сбой или неожиданный статус Go |
| `not_requested` | На BFF отсутствовала активная сессия |

Получив результат, клиент переходит в гостя и показывает предупреждение при `unconfirmed` или `unknown`. Если сама RPC завершилась ошибкой, клиент показывает ошибку выхода. При выходе со всех устройств и смене пароля BFF завершает сессию после подтверждённого успеха Go, а клиент переходит в гостя. [стор клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/session.ts#L98-L155), [router/users.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/users.ts#L27-L35), [router/auth.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/auth.ts#L30-L35).

См. [профиль](../workflows/profile.md), [контракты и ошибки](../integrations/contracts.md) и [потерю соединения](offline.md).
