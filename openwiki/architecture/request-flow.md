---
type: architecture
title: "Первый HTML, маршруты и загрузка блокнота"
description: "Как BFF выбирает ответ на прямой запрос страницы и как клиент загружает тот же блокнот при переходе внутри SPA."
tags: [bff, routing, bootstrap, notebooks]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-f9ef5639537da6fed9ffbf89
    resource: repo://apps/bff/src/app.ts
  - id: openwiki-source-eb237af3f199730f9b3e53e3
    resource: repo://apps/bff/src/bff.ts
  - id: openwiki-source-2a999c63e2c412ffe7b5cadc
    resource: repo://apps/bff/src/html.ts
  - id: openwiki-source-c60f2c287ac07af559a20eda
    resource: repo://apps/bff/src/notebook.ts
  - id: openwiki-source-6b0c82dfd593518928389faa
    resource: repo://apps/bff/src/pages.ts
  - id: openwiki-source-fab339fa0fa4e9e9352be6f8
    resource: repo://apps/bff/src/router/notebooks.ts
  - id: openwiki-source-436f60f0fcb25cdaf7035323
    resource: repo://apps/client/src/bootstrap.ts
  - id: openwiki-source-bf47c30b7933f3e39a4ad225
    resource: repo://apps/client/src/main.tsx
  - id: openwiki-source-96c56a208f8151dd249d1ddb
    resource: repo://apps/client/src/pages/NotebookPage/NotebookPage.tsx
  - id: openwiki-source-1cef99daefb2e0b6d1893f9f
    resource: repo://apps/client/src/routes/auth.ts
  - id: openwiki-source-bf10cf6356a8969231e90299
    resource: repo://apps/client/src/routes/guest.ts
  - id: openwiki-source-aae14d8ce0fe8cf336785ae7
    resource: repo://apps/client/src/routes/routeTree.ts
  - id: openwiki-source-b6bde8816e0fe9ab4f87e552
    resource: repo://apps/client/src/stores/preloaded.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Первый HTML, маршруты и загрузка блокнота

## HTML и RPC на одном BFF

`createBff` связывает HTML-обработчик, Hono и адаптер tRPC. Hono обслуживает `/health` и `/api/trpc` отдельными маршрутами, для остальных `/api` возвращает 404. После публичных файлов GET с `Accept: text/html` передаётся HTML-обработчику. BFF передаёт HEAD в Hono как GET, а Bun отбрасывает тело ответа. [apps/bff/src/app.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/app.ts#L27-L57), [apps/bff/src/bff.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/bff.ts#L17-L42).

`PAGES` — общий список страниц для сопоставления HTML-запросов на BFF и для маршрутов клиента. Новую страницу регистрируют здесь и добавляют в дерево SPA. `beforeLoad` у `_auth` ведёт гостя на вход, у `_guest` ведёт вошедшего на главную. Корневой маршрут применяет те же направления для неизвестного адреса. [apps/bff/src/pages.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/pages.ts#L1-L16), [auth.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/routes/auth.ts#L5-L12), [guest.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/routes/guest.ts#L11-L18), [root.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/routes/root.tsx#L10-L23).

## Прямой запрос страницы

При активной сессии BFF читает пользователя через Go. В bootstrap попадают только `id`, `login`, `avatar_url` и `has_2fa`. Для открываемого блокнота BFF также проверяет декодированный ID и загружает данные страницы. [apps/bff/src/html.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/html.ts#L62-L120).

| Ситуация | Ответ |
| --- | --- |
| Гость на входе или регистрации | HTML с `user: null` |
| Гость на остальных адресах, включая неизвестный и `/404` | 302 на `/login` |
| Вошедший на неизвестном адресе или `/404` | 302 на главную |
| Вошедший с некорректным ID блокнота или Go 404 при его загрузке | 302 на главную |
| Сбой чтения из Go | 503 со страницей без приложения |

Завершившаяся сессия переводит запрос в гостевую ветку. Решение о cookie сохраняется и в ответе 503. [apps/bff/src/html.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/html.ts#L106-L140), [сессия BFF](../concepts/session.md).

## Bootstrap и переход внутри SPA

BFF сериализует данные через `serialize-javascript` с `isJSON`, вставляет JSON в `script#bootstrap` через `HTMLRewriter` и задаёт `Cache-Control: private, no-store`. Клиент требует единственный тег с `type="application/json"` и проверяет форму пользователя и необязательных данных блокнота. `main.tsx` заполняет сессию и сохранённый bootstrap блокнота до первого рендера. При дефекте показывает ошибку запуска без резервного `users.me`. [html.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/html.ts#L11-L46), [bootstrap.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/bootstrap.ts#L22-L64), [main.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/main.tsx#L18-L32).

HTML и `notebooks.get` используют общий серверный загрузчик. Метаданные, согласованная пара `hash` и ячеек, активная сессия читаются параллельно. Очередь загружается, если активная сессия относится к открытому блокноту. При входе на страницу клиент один раз забирает подходящий bootstrap, затем использует tRPC. Некорректный ID, `NOT_FOUND` и `BAD_REQUEST` ведут на главную. При прочих ошибках загрузку можно повторить. [notebook.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/notebook.ts#L22-L53), [notebooks.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/notebooks.ts#L19-L22), [preloaded.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/preloaded.ts#L16-L29), [NotebookPage.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/NotebookPage.tsx#L70-L77), [инициализация страницы](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/NotebookPage.tsx#L255-L285).

[Профиль](../workflows/profile.md) входит в защищённое дерево SPA. Точка входа клиента подключает наблюдение за соединением и регистрирует service worker вне режима разработки. Подробнее в [PWA и потере соединения](../concepts/offline.md). После загрузки страницы состояние разделяется между [редактированием](../workflows/notebook.md) и [выполнением ячеек](../workflows/runtime.md). [routeTree.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/routes/routeTree.ts#L9-L14), [main.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/main.tsx#L40-L51).
