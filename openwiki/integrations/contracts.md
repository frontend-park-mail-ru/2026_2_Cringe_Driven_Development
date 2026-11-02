---
type: integration
title: Контракты BFF, Go и командные пакеты
description: Два API-рубежа frontend, проверка данных и ошибок, генерация схем из Apidog и граница владения frontend-packages.
tags: [trpc, go, contracts, schemas, packages]
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-a68c0099cff62087569982e8
    resource: repo://apps/bff/src/errors.ts
  - id: openwiki-source-68c1b089f7e6c588dc622cc7
    resource: repo://apps/bff/src/go/api.ts
  - id: openwiki-source-bbf739063a56f9250343b7b6
    resource: repo://apps/bff/src/go/errors.ts
  - id: openwiki-source-9bb02eb0e2dd94eb4ed0c69a
    resource: repo://apps/bff/src/go/fetch.ts
  - id: openwiki-source-baf5aef4dd91a70c72c54dd6
    resource: repo://apps/bff/src/router/cells.ts
  - id: openwiki-source-85567ee6d3acb8d53e12eb75
    resource: repo://apps/bff/src/router/index.ts
  - id: openwiki-source-fab339fa0fa4e9e9352be6f8
    resource: repo://apps/bff/src/router/notebooks.ts
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
  - id: openwiki-source-82b68c6a8fd150b4ff72587b
    resource: repo://docs/local-development.md
  - id: openwiki-source-3dfcfd64a44b04f5b62b200f
    resource: repo://orval.config.ts
generated: { by: "codex", at: "2026-11-02T21:50:56.050Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:50:56.050Z
---

# Контракты BFF, Go и командные пакеты

Основание — код frontend на `d6bdf92f45c039c28dd82c69b1402485b995c222`. Внутреннее устройство Go и командных библиотек проверяют в репозиториях их владельцев.

## Браузер → BFF

Клиент обращается к `/api/trpc` через единый `trpc`, использующий `httpBatchLink`. Типы `RouterInputs`, `RouterOutputs` выводятся из `AppRouter` и импортируются как типы; server runtime этим импортом в клиент не переносится. Роутер объединяет `auth`, `users`, `notebooks`, `cells`. [Транспорт](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/api/trpc.ts#L112-L123), [типы](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/types.ts#L1-L24), [роутер](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/index.ts#L1-L11).

Входы процедур валидируются на сервере. Например, `notebooks.get` принимает положительный целочисленный ID; `cells.create` использует strict-объект с ID блокнота и полями `CreateCellBody`, а `cells.delete` — неотрицательный индекс. Защищённая процедура без сессии возвращает `UNAUTHORIZED` до вызова Go. [Процедуры блокнотов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/notebooks.ts#L7-L15), [ячейки](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/cells.ts#L7-L20), [доступ](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/trpc.ts#L49-L53).

## BFF → Go

`createGo(session)` оборачивает операции HTTP-клиента в `session.call`, затем проверяет ожидаемый статус и тело через `unwrap`. Для ответов с данными используются схемы `@cdd/schemas`; для удаления ожидается 204. Успешный HTTP-статус с некорректным телом становится `GoError('unexpected')`. [Обёртки операций](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/go/api.ts#L57-L99), [валидация ответа](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/go/errors.ts#L46-L64).

`bearerFetch` дописывает `GO_API_URL`, при настроенном `BFF_KEY` ставит `X-BFF-Key` и ограничивает запрос пятью секундами. Bearer и request ID поступают из слоя сессии, а не копируются из браузерных заголовков. Значения адресов и ключей находятся в конфигурации BFF и не являются частью wiki. [Fetch-мутатор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/go/fetch.ts#L4-L42), [заголовки сессии](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/session/session.ts#L103-L109). Refresh и повтор после 401 описаны в [сессии](../concepts/session.md).

## Ошибки — часть контракта

| Ошибка на границе | Ответ процедуры |
| --- | --- |
| Завершение сессии | `UNAUTHORIZED` |
| Go 400, 401, 403, 404, 409 | `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `s2s_forbidden`, непредусмотренный статус, сеть, таймаут, неверное тело | `BAD_GATEWAY` |
| Иное неожиданное исключение | `INTERNAL_SERVER_ERROR` |

Форматтер удаляет stack, скрывает сообщение внутренней ошибки, добавляет `appCode` и ошибки zod в `zodError`. Клиент различает категории по этим полям, а не по тексту сообщения. [Преобразование ошибок](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/errors.ts#L22-L65), [форматтер](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/trpc.ts#L8-L25), [разбор ошибок формы](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/session.ts#L55-L65).

## Откуда берутся схемы

HTTP-контракт ведётся в Apidog; `bun run sync` последовательно выгружает копию и запускает Orval. `orval.config.ts` производит HTTP-клиент BFF и zod-схемы из одной копии контракта, подключая `bearerFetch` как мутатор. Generated `client.ts` и `zod.ts` коммитятся, но вручную не правятся и не используются здесь как самостоятельное доказательство поведения. [Правила контракта](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/docs/api-contract.md#L3-L19), [конфигурация генерации](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/orval.config.ts#L3-L27).

## Где менять командные пакеты

Frontend зависит от `@cdd-team/react`, `router`, `zustand`, `clsx`; dev-конфигурация вызывает `bffHtml` из `@cdd-team/vite-plugin-bff-html`. Это точки потребления библиотек: рендер, маршрутизация, стор, классы и получение HTML от BFF в dev. [Зависимости](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/package.json#L13-L29), [подключение плагина](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/vite.config.dev.ts#L64-L82).

Для изменения самого Vite-плагина перейдите в [frontend-packages/packages/vite-plugin-bff-html](https://github.com/Cringe-Driven-Development-Team/frontend-packages/tree/main/packages/vite-plugin-bff-html), для React и других `@cdd-team/*` — в репозиторий [frontend-packages](https://github.com/Cringe-Driven-Development-Team/frontend-packages). Маршрут владельца закреплён в [AGENTS frontend](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/AGENTS.md#L28-L34) и [локальной документации](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/docs/local-development.md#L137-L149). Эти внешние ссылки — указатели: эта wiki не подтверждает актуальный код соседнего репозитория.

Смежные страницы: [путь HTML и SPA](../architecture/request-flow.md), [разработка и тесты](../operations/development.md), [quickstart](../quickstart.md).

## Профиль и проверка контракта

`users.me`, `users.updateLogin` и `users.changePassword` — защищённые процедуры. BFF проверяет входы через `UpdateCurrentUserBody` и `ChangeCurrentUserPasswordBody`; смена логина проходит через `session.call` и проверку схемы ответа, смена пароля ждёт 204 и затем завершает сессию. UI-сценарии и ошибки разобраны в [профиле](../workflows/profile.md). [Процедуры](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/users.ts#L1-L19), [адаптеры Go](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/go/api.ts#L57-L69).

Документированный порядок Spec First требует актуального Apidog, синхронизации и проверки интерфейса через BFF → Cloud Mock той же ветки. Дефект мока исправляют в Apidog; собственный dev-сервер Go не подменяет этот рубеж. Фиксированные ответы Cloud Mock не доказывают сохранение логина или отзыв сессий: это отдельная интеграция с Go. Wiki фиксирует этот порядок по локальной документации и не утверждает, что внешний контракт был проверен в этом запуске. [Порядок и границы мока](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/docs/api-contract.md#L29-L67).
