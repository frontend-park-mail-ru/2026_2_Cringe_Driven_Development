---
type: integration
title: "Контракты BFF, Go и командные пакеты"
description: "Проверка входов и ответов на границах tRPC и Go, ошибки и обновление закреплённой копии OpenAPI."
tags: [trpc, go, openapi, contracts, schemas]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-a68c0099cff62087569982e8
    resource: repo://apps/bff/src/errors.ts
  - id: openwiki-source-68c1b089f7e6c588dc622cc7
    resource: repo://apps/bff/src/go/api.ts
  - id: openwiki-source-bbf739063a56f9250343b7b6
    resource: repo://apps/bff/src/go/errors.ts
  - id: openwiki-source-3e92e60d23010a2d3e62a3b5
    resource: repo://apps/bff/src/go/request.ts
  - id: openwiki-source-baf5aef4dd91a70c72c54dd6
    resource: repo://apps/bff/src/router/cells.ts
  - id: openwiki-source-85567ee6d3acb8d53e12eb75
    resource: repo://apps/bff/src/router/index.ts
  - id: openwiki-source-e13a38cf859a665445e386cf
    resource: repo://apps/bff/src/router/users.ts
  - id: openwiki-source-4fa129eae81b89c6a34439f3
    resource: repo://apps/bff/src/session/session.ts
  - id: openwiki-source-2163fa064582528c3ea56158
    resource: repo://apps/bff/src/trpc.ts
  - id: openwiki-source-35838a6737c95b21be44361d
    resource: repo://apps/bff/src/types.ts
  - id: openwiki-source-d9e8131b34be096fc6a58e13
    resource: repo://apps/client/package.json
  - id: openwiki-source-b078c46af746a6b2d1e173d3
    resource: repo://apps/client/src/api/trpc.ts
  - id: openwiki-source-9015e7a0ae6d197733d3d6dc
    resource: repo://apps/client/vite.config.dev.ts
  - id: openwiki-source-b0297e82ef2c80516c64d1b2
    resource: repo://docs/api-contract.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-53995350190e38c2d82a42aa
    resource: repo://packages/http-client/package.json
  - id: openwiki-source-dbdde4eeae22f36f2a34532f
    resource: repo://scripts/dev/prism.ts
  - id: openwiki-source-0ec7e607b129019fbfc092e6
    resource: repo://scripts/openapi/backend.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Контракты BFF, Go и командные пакеты

## Браузер → BFF

Единый `trpc` отправляет JSON через `httpBatchLink`; multipart для аватара идёт отдельным запросом через `httpLink`. Клиент берёт `RouterInputs` и `RouterOutputs` из `AppRouter` через импорт типов. Роутер объединяет `auth`, `users`, `twoFactor`, `notebooks`, `cells` и `runtime`. [trpc.ts клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/api/trpc.ts#L146-L171), [types.ts BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/types.ts#L1-L24), [router/index.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/index.ts#L1-L13).

`notebooks.get` принимает положительный целочисленный ID. `cells.*` проверяют строгие объекты с ID блокнота и hash; изменение, перемещение и удаление адресуются по `cellId`. У защищённой процедуры отсутствие сессии даёт `UNAUTHORIZED` до вызова Go. [notebooks.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/notebooks.ts#L19-L22), [cells.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/cells.ts#L11-L46), [trpc.ts BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/trpc.ts#L43-L56).

В [профиле](../workflows/profile.md) BFF проверяет входы обновления логина и смены пароля схемами, проверяет ответ Go на обновление логина, а после ожидаемого 204 при смене пароля завершает сессию. [users.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/users.ts#L18-L35), [go/api.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L149-L176).

## BFF → Go

`go()` использует общий клиент `@cdd-team/http-client` из `packages/http-client` с картой `GoPaths`. Транспорт дописывает `GO_API_URL`, ставит `X-BFF-Key`, если настроен `BFF_KEY`, и ограничивает вызов пятью секундами с учётом чтения тела. Bearer и request ID для защищённых вызовов формирует сессия. [go/request.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/request.ts#L1-L50), [session.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/session/session.ts#L115-L122), [packages/http-client/package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/packages/http-client/package.json#L1-L11).

`createGo(session)` вызывает защищённые операции через `session.call` с отдельной веткой для обычного выхода. `unwrap` проверяет ожидаемый статус и, если задана схема, проверяет тело. Успешный статус с неподходящим телом даёт `GoError('unexpected')`. [go/api.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L140-L176), [выход](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L289-L309), [go/errors.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/errors.ts#L42-L79).

| Условие | Код tRPC |
| --- | --- |
| Завершение сессии | `UNAUTHORIZED` |
| Go 400, 401, 403, 404, 409 | `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| Go 412, 413, 415, 429 | `PRECONDITION_FAILED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `TOO_MANY_REQUESTS` |
| `invalid_totp` | `BAD_REQUEST` |
| `s2s_forbidden`, непредусмотренный статус, сеть, таймаут или неожиданное тело | `BAD_GATEWAY` |

Форматтер скрывает stack и сообщение внутренней ошибки. В `data` он передаёт `appCode`, проверенные данные занятой сессии для `active_session_exists` и ошибки полей `zodError`, когда они есть. [errors.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/errors.ts#L24-L80), [go/errors.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/errors.ts#L57-L69), [trpc.ts BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/trpc.ts#L9-L27).

## Закреплённый контракт

`contract:fetch <sha>` загружает комплект `spec/` из репозитория backend по полному SHA, проверяет его закреплённой версией Redocly и затем заменяет локальную копию с манифестом. `contract:verify` сверяет файлы с указанной в манифесте ревизией. `bun run sync` запускает Redocly по локальной копии. DTO и `GoPaths` в `packages/schemas/src/types.ts` обновляют вручную по диффу контракта. Компилятор проверяет использование типов приложением, а сетевые данные проверяются при выполнении. [package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/package.json#L23-L29), [scripts/openapi/backend.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/openapi/backend.ts#L28-L98), [docs/api-contract.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/docs/api-contract.md#L3-L42).

Spec First требует согласовать контракт в backend, обновить копию и типы, затем проверить примеры и ошибки через `bun run dev:prism`. Сохранение изменений и отзыв сессий проверяют с Go. [docs/api-contract.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/docs/api-contract.md#L55-L79).

## Владельцы зависимостей

Клиент использует `@cdd-team/react`, `router`, `zustand` и `clsx`, а dev-конфигурация вызывает `bffHtml` для получения HTML от BFF. Код опубликованных командных библиотек ищут в frontend-packages. `@cdd-team/http-client` находится в этом workspace. [apps/client/package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/package.json#L13-L28), [vite.config.dev.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/vite.config.dev.ts#L70-L83), [packages/http-client/package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/packages/http-client/package.json#L1-L11), [AGENTS.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/AGENTS.md#L43-L49).

См. [первый HTML](../architecture/request-flow.md), [сессию](../concepts/session.md) и [разработку](../operations/development.md).
