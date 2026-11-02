---
type: security
title: Сессия, CSRF и смена пользователя
description: Владение токенами в BFF, обновление сессии, CSRF-проверки и порядок запросов при входе и выходе клиента.
tags: [session, csrf, authentication, concurrency]
sources:
  - id: openwiki-source-2189d746259f9de2b75640e0
    resource: repo://apps/bff/src/context.ts
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
generated: { by: "codex", at: "2026-11-02T21:57:05.254Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:57:05.254Z
---

# Сессия, CSRF и смена пользователя

Страница описывает код на `d6bdf92f45c039c28dd82c69b1402485b995c222`, без вывода о выкладке.

## Кто хранит состояние

BFF хранит access/refresh и их сроки в зашифрованной cookie `__Host-Http-session`. Атрибуты — `Path=/; HttpOnly; Secure; SameSite=Lax`, без `Domain`; шифрование использует AES-GCM, случайный IV и имя cookie как AAD. Значение `SESSION_KEY` приходит из конфигурации, здесь оно не публикуется. Ошибка расшифровки или истёкший refresh создают гостевую сессию с удалением cookie, без запроса Go. [Cookie](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/session/cookies.ts#L1-L35), [шифрование](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/session/crypto.ts#L12-L70), [чтение сессии](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/session/session.ts#L129-L142).

Процедуры входа и регистрации возвращают клиенту пользователя, а токены передают `session.start`. Выход отзывает refresh в Go по возможности и завершает локальную сессию даже при сбое этого вызова. Клиентский стор содержит только `guest | authed` и пользователя; первоначальное значение поступает из [bootstrap](../architecture/request-flow.md). [Auth router](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/auth.ts#L6-L26), [стор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/session.ts#L5-L31).

## CSRF до сессии и Go

Каждый RPC требует `X-CSRF: 1`. Для POST дополнительно проверяется точное совпадение `Origin` с `APP_ORIGIN`; присутствующий `Sec-Fetch-Site` должен быть `same-origin`. Отказ — `FORBIDDEN` с `appCode: csrf_invalid`, до чтения cookie и обращения к Go. Единый клиент tRPC ставит этот заголовок и `credentials: 'same-origin'`. [Контекст BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/context.ts#L11-L31), [транспорт клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/api/trpc.ts#L112-L123).

## Refresh и решение о cookie

`session.call` обновляет access, если до истечения менее 30 секунд. После 401 делает refresh и один повтор; повторный 401 завершает сессию. Заголовки Go собирает сама сессия: Bearer и request ID. При ошибке refresh только `SessionEnded` удаляет сессию, остальные ошибки сохраняют её. `setCookies` применяет итоговое решение к заголовкам ответа; tRPC вызывает его в `finally`. [Алгоритм сессии](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/session/session.ts#L73-L125), [middleware](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/trpc.ts#L30-L39).

`refreshTokens` объединяет одновременные запросы одного refresh по SHA-256 токена в process-local `Map`. Успешный результат остаётся на 10 секунд, неудачный сразу удаляется. Это координация в пределах процесса BFF, не распределённая блокировка между экземплярами. Отказ Go 401 становится `SessionEnded`; остальные ошибки проходят через проверку ответа. [Refresh](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/session/refresh.ts#L15-L67).

## Клиент не позволяет старому ответу сменить пользователя

Все процедуры кроме `auth.*` и `users.changePassword` считаются обычными защищёнными запросами. Смена пароля выделена в смену сессии: ей самой нужна сессия, и её `UNAUTHORIZED` отмечает потерю сессии при неуспехе операции. `sessionLink` учитывает незавершённые запросы и поколение сессии. Ответ другого поколения отклоняется с `SESSION_CHANGED`; `UNAUTHORIZED` активного поколения вызывает обработчик потери сессии. В `main.tsx` обработчик очищает стор, показывает уведомление и ведёт на `/login`. [Link](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/api/trpc.ts#L22-L106), [реакция интерфейса](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/main.tsx#L31-L36).

`login`, `register`, `logout`, `changePassword` проходят через `switchSession`: смены ставятся в очередь, новые защищённые запросы отвергаются, уже отправленные завершаются перед вызовом смены. Поэтому их ответы с `Set-Cookie` приходят до установки новой сессии. Если вызов смены не удался, но во время ожидания пришёл `UNAUTHORIZED`, сессия всё равно теряется. Обычный сетевой сбой выхода без такого события сохраняет прежнее состояние. [Очередь смен](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/api/trpc.ts#L142-L180), [действия стора](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/session.ts#L73-L124).

Проверять изменения порядка запросов следует по `apps/client/test/session.test.ts`: настоящий tRPC-клиент с управляемым `fetch` проверяет потерю сессии и перекрывающиеся смены. BFF-тесты отдельно проверяют объединение refresh, повторный 401 и ошибки Go. [Клиентские сценарии](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/session.test.ts#L48-L141), [BFF-сценарии](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/bff.test.ts#L156-L218).

Смежные страницы: [контракты и ошибки](../integrations/contracts.md), [разработка и проверки](../operations/development.md), [общая карта](../quickstart.md).

После успешной `users.changePassword` BFF завершает cookie-сессию, а действие стора переводит пользователя в гостя. При ошибке текущего пароля этого не происходит; сетевой результат не повторяется формой автоматически. Подробности — в [профиле](../workflows/profile.md). [BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/users.ts#L6-L19), [стор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/session.ts#L98-L108).

HTTP-ошибки, отличные от `UNAUTHORIZED`, и сбой сети сами по себе не вызывают `onSessionLost`; доступность соединения отслеживается отдельно в [PWA и потере соединения](offline.md). Сценарии смены пароля с незавершёнными запросами и 401 проверяют [тесты транспорта](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/session.test.ts#L155-L210).
