---
type: architecture
title: Первый HTML, маршруты и блокноты
description: Как BFF решает прямой запрос страницы, передаёт bootstrap и как SPA продолжает работу с блокнотом и ячейками.
tags: [frontend, bff, bootstrap, routing, notebooks]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:50:56.050Z
sources:
  - id: openwiki-source-f9ef5639537da6fed9ffbf89
    resource: repo://apps/bff/src/app.ts
  - id: openwiki-source-eb237af3f199730f9b3e53e3
    resource: repo://apps/bff/src/bff.ts
  - id: openwiki-source-2a999c63e2c412ffe7b5cadc
    resource: repo://apps/bff/src/html.ts
  - id: openwiki-source-6b0c82dfd593518928389faa
    resource: repo://apps/bff/src/pages.ts
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
generated: { by: "codex", at: "2026-11-02T21:50:56.050Z" }
---

# Первый HTML, маршруты и блокноты

Это описание кода frontend на `d6bdf92f45c039c28dd82c69b1402485b995c222`; оно не подтверждает состояние стенда.

## Две точки входа одного приложения

`createBff` связывает Hono, HTML handler и tRPC adapter. Hono сначала обслуживает `/health` и `/api/trpc`, остальные `/api` возвращают 404 без проксирования в Go. Затем идут `robots.txt`, публичные файлы и HTML для GET с `Accept: text/html`. Входящий HEAD преобразуется в GET перед Hono, тело отбрасывает Bun. Это объясняет, почему неизвестный API и неизвестная страница проходят разные ветви. [Сборка обработчика](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/bff.ts#L17-L37), [порядок маршрутов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/app.ts#L28-L58).

Общий `PAGES` в `apps/bff/src/pages.ts` задаёт адреса списка, входа, регистрации, блокнота, профиля и 404; клиент импортирует его через `@cdd/bff/pages`. Новую страницу добавляют в этот список и дерево клиентских маршрутов, иначе прямой HTML-запрос не будет распознан. [Общий список](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/pages.ts#L1-L16).

## Решение BFF до запуска клиента

HTML handler создаёт сессию; при активной сессии получает пользователя через `go.getCurrentUser`. В bootstrap пользователя берёт только `id`, `login` и `avatar_url`. Для страницы блокнота проверяет положительный безопасный целочисленный ID и запрашивает блокнот до выдачи HTML. [Обработчик](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/html.ts#L82-L126).

| Состояние запроса | Ответ HTML handler |
| --- | --- |
| Гость, вход или регистрация | Приложение с `user: null` |
| Гость, `/404` | Приложение со статусом 404 |
| Гость, защищённый или неизвестный адрес | 302 на `/login`, блокнот не запрашивается |
| Вошедший, неизвестный адрес | 302 на `/404` |
| Блокнот с некорректным ID или ответом Go 404 | 302 на `/404` |
| Ошибка Go, кроме завершившейся сессии | 503 без запуска приложения |

Обработка Go 404 не различает отсутствие блокнота и отсутствие доступа. Завершившаяся сессия превращает запрос в гостевой; иные сбои не маскируются отсутствием блокнота. Ответ сохраняет решение сессии о cookie, в том числе после успешного refresh и последующего сбоя. Правила находятся в том же [HTML handler](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/html.ts#L91-L126); поведение самой сессии — на [отдельной странице](../concepts/session.md).

## Bootstrap — условие первого рендера

BFF сериализует данные через `serialize-javascript` с `isJSON`, вставляет их в `script#bootstrap` новым `HTMLRewriter` и задаёт `Cache-Control: private, no-store`. [Запись bootstrap](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/html.ts#L10-L44).

Клиент требует ровно один `<script id="bootstrap" type="application/json">`, валидный JSON, пользователя или `null` и базовую форму блокнота, если он присутствует. До рендера `main.tsx` заполняет стор сессии и preloaded-блокнот. При дефекте показывает ошибку запуска; резервного запроса `users.me` нет. [Чтение](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/bootstrap.ts#L23-L55), [запуск](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/main.tsx#L15-L41).

Внутри SPA `beforeLoad` у `_auth` направляет гостя на вход, `_guest` направляет вошедшего на главную. Эти проверки используют уже известный статус стора. [Защищённые маршруты](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/routes/auth.ts#L5-L12), [гостевые маршруты](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/routes/guest.ts#L11-L18).

## Блокнот после загрузки

`NotebookPage` использует подходящий preloaded-блокнот для начального состояния и забирает его один раз; дальше вызывает `trpc.notebooks.get`. `NOT_FOUND` и `BAD_REQUEST` ведут на `/404`, другие ошибки показывают состояние ошибки и повтор. Добавление и удаление ячеек сериализованы флагом `busy`: удаление передаёт порядковый индекс, вычисленный по ID в текущем списке. UI меняется только после успешного ответа. [Загрузка и состояния](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/pages/NotebookPage/NotebookPage.tsx#L118-L163), [мутации](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/pages/NotebookPage/NotebookPage.tsx#L179-L234).

Проверки прямого HTML, 404, 503 и экранирования находятся в `apps/bff/test/bff.test.ts` в группе HTML. [Сценарии тестов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/bff.test.ts#L290-L461). Команды запуска — в [разработке](../operations/development.md); схема вызовов Go — в [контрактах](../integrations/contracts.md); общая карта — в [quickstart](../quickstart.md).

Страница [профиля](../workflows/profile.md) добавлена в `_auth` и использует тот же `PAGES.profile`. После bootstrap `main.tsx` регистрирует service worker и слежение за соединением; их границы описаны в [PWA и потере соединения](../concepts/offline.md). [Дерево маршрутов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/routes/routeTree.ts#L9-L14), [подключение](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/main.tsx#L38-L41).
