---
type: concept
title: PWA и потеря соединения
description: Как service worker даёт самостоятельную офлайн-страницу, а открытая SPA отслеживает ответы BFF без кеширования личных данных.
tags: [frontend, pwa, offline, connection, cache]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:50:56.050Z
sources:
  - id: openwiki-source-f9ef5639537da6fed9ffbf89
    resource: repo://apps/bff/src/app.ts
  - id: openwiki-source-5e0084743da039a51b7bc6f3
    resource: repo://apps/bff/src/public.ts
  - id: openwiki-source-b078c46af746a6b2d1e173d3
    resource: repo://apps/client/src/api/trpc.ts
  - id: openwiki-source-60278d1b2092265a52c54f9e
    resource: repo://apps/client/src/components/OfflineBanner/OfflineBanner.tsx
  - id: openwiki-source-03b8d984a7c354ece6e0a3be
    resource: repo://apps/client/src/layouts/RootLayout.tsx
  - id: openwiki-source-09f8e9b6681692c71bd5a800
    resource: repo://apps/client/src/serviceWorker.ts
  - id: openwiki-source-685a23fe7d7e5be9fde9e9fa
    resource: repo://apps/client/src/stores/connection.ts
  - id: openwiki-source-1a24bbcbef761adbf3654cda
    resource: repo://apps/client/vite/plugins.ts
  - id: openwiki-source-e930a7680374d071dc2088af
    resource: repo://scripts/dev/pwa.ts
generated: { by: "codex", at: "2026-11-02T21:50:56.050Z" }
---

# PWA и потеря соединения

На исходном SHA `d6bdf92f45c039c28dd82c69b1402485b995c222` есть два независимых механизма: fallback для навигации браузера и предупреждение поверх уже открытой SPA. Наличие этой конфигурации не подтверждает установку приложения или состояние стенда.

## Что происходит при открытии страницы

`vitepwaPlugin` собирает манифест и единый `sw.js`. Для навигации задан `NetworkOnly`: при отказе сети Workbox возвращает `/offline.html` из precache. В precache входят только `offline.html` и `offline.css`. Пользовательский HTML, RPC, JS и CSS SPA туда не включены; навигационного fallback на `index.html` нет. Офлайн-страница сообщает, что блокноты и личные данные недоступны, и повторяет исходный адрес ссылкой без скриптов. [Политика кеша](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/vite/plugins.ts#L36-L63), [страница](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/public/offline.html#L1-L16).

Манифест, SW, иконки и офлайн-файлы BFF отдаёт с origin приложения через `PUBLIC_FILES`, до HTML handler и чтения сессии. `loadPublicFiles` останавливает запуск, если обязательного файла нет; Dockerfile копирует тот же список. Манифест задаёт `start_url` и `scope` `/`, режим `standalone` и обычные и maskable иконки. [Список и загрузка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/public.ts#L3-L45), [порядок маршрутов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/app.ts#L39-L55), [упаковка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/Dockerfile#L8-L12), [манифест](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/vite/plugins.ts#L64-L84).

`main.tsx` вызывает `registerServiceWorker`. Регистрация немедленная, ошибка только логируется. `skipWaiting` и `clientsClaim` включены, `onNeedReload` не перезагружает вкладку: обновление SW не должно уничтожать введённые данные. В обычном dev SW не регистрируется. [Регистратор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/serviceWorker.ts#L1-L15), [подключение](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/main.tsx#L38-L41).

## Открытая SPA при потере связи

Единственный клиент tRPC использует `fetchTracked`. Он читает копию тела ответа целиком и только затем подтверждает доступность BFF. Отказ fetch и обрыв тела устанавливают `lost: true` и пробрасывают ошибку; полностью полученный 503 или невалидный JSON подтверждает соединение, но не успех RPC. Это отделяет сетевой сбой от ошибки процедуры. [Транспорт](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/api/trpc.ts#L113-L123), [отслеживание](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/connection.ts#L22-L43).

Начальное состояние учитывает `navigator.onLine`. Событие `offline` поднимает предупреждение; `online` лишь запускает запрос `/robots.txt` с `cache: 'no-store'`. Первый полный ответ после потери связи снимает предупреждение и показывает один тост восстановления. `OfflineBanner` находится в корневом макете рядом с `<main>`, поэтому текущий экран остаётся смонтированным. [Переходы состояния](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/connection.ts#L9-L51), [баннер](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/components/OfflineBanner/OfflineBanner.tsx#L4-L16), [макет](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/layouts/RootLayout.tsx#L13-L26).

Сетевой сбой сам по себе не завершает [сессию](session.md). Обычный путь выдачи HTML и bootstrap описан в [маршрутах](../architecture/request-flow.md).

## Где проверять и расширять

`bun run dev:pwa` собирает клиент без CDN base и запускает BFF с публичными файлами и локальными `assets/`. HMR в этом режиме нет; после правки клиента команду запускают заново. Настройки порта и origin находятся в `scripts/dev/pwa.ts`. [Сценарий запуска](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/dev/pwa.ts#L1-L30).

Тесты соединения покрывают отказ fetch, HTTP-ошибку, обрыв тела, невалидный JSON и единственный тост восстановления. BFF-тесты проверяют выдачу offline HTML/CSS без Go, а `public.test.ts` — согласованность списка с упаковкой и ограничение локальных ассетов каталогом `assets/`. Это проверки кода, а не браузерная проверка установленной PWA. [Соединение](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/connection.test.ts#L18-L68), [offline HTTP](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/bff.test.ts#L466-L485), [упаковка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/public.test.ts#L7-L32). Другие команды — в [разработке](../operations/development.md).
