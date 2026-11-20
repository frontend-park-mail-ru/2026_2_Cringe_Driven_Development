---
type: concept
title: "PWA и потеря соединения"
description: "Кеш офлайн-страницы в service worker и предупреждение о недоступности BFF в открытом приложении."
tags: [pwa, service-worker, offline, connection]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-f9ef5639537da6fed9ffbf89
    resource: repo://apps/bff/src/app.ts
  - id: openwiki-source-5e0084743da039a51b7bc6f3
    resource: repo://apps/bff/src/public.ts
  - id: openwiki-source-b078c46af746a6b2d1e173d3
    resource: repo://apps/client/src/api/trpc.ts
  - id: openwiki-source-9835042e798f44f53d3a543b
    resource: repo://apps/client/src/components/Snackbar/Snackbar.tsx
  - id: openwiki-source-03b8d984a7c354ece6e0a3be
    resource: repo://apps/client/src/layouts/RootLayout.tsx
  - id: openwiki-source-bf47c30b7933f3e39a4ad225
    resource: repo://apps/client/src/main.tsx
  - id: openwiki-source-685a23fe7d7e5be9fde9e9fa
    resource: repo://apps/client/src/stores/connection.ts
  - id: openwiki-source-b73fdb809a71fd814f05f6cd
    resource: repo://apps/client/sw/sw.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-8ed39f8987052529a3fb597d
    resource: repo://scripts/dev/preview.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# PWA и потеря соединения

## Открытие страницы без сети

Vite собирает отдельную точку входа `sw/sw.ts` как `/sw.js`. Клиент регистрирует её с областью `/` вне dev, если браузер поддерживает service worker. Ошибка регистрации остаётся в консоли. Статический манифест подключён из HTML приложения. [vite.config.prod.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/vite.config.prod.ts#L18-L37), [main.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/main.tsx#L40-L47), [index.html](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/index.html#L5-L12).

При установке SW сохраняет `offline.html`, `offline.css` и `onest-variable.woff2`, затем вызывает `skipWaiting`. При активации удаляет прежние версии своего кеша и принимает управление текущими клиентами через `clients.claim`. После изменения любого из трёх файлов версия кеша меняется в `sw.ts`. [apps/client/sw/sw.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/sw/sw.ts#L3-L35).

Для GET-навигации и трёх офлайн-файлов SW сначала обращается к сети. Если `fetch` отклонён, навигация получает кешированную офлайн-страницу, а запрос к офлайн-файлу получает соответствующий файл. Возвращённый HTTP-ответ, включая ошибку, проходит к браузеру. HTML пользователя, RPC и ассеты SPA отсутствуют в офлайн-кеше. [apps/client/sw/sw.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/sw/sw.ts#L37-L52).

BFF выдаёт SW, манифест, иконки и офлайн-файлы с origin приложения до обработки HTML. Отсутствие файла из `PUBLIC_FILES` прерывает загрузку этого набора. Список копируемых файлов задаёт Dockerfile. [public.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/public.ts#L3-L18), [загрузка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/public.ts#L34-L47), [app.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/app.ts#L46-L57), [Dockerfile](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/Dockerfile#L8-L13).

## Потеря связи в открытой SPA

Транспорт tRPC использует `fetchTracked`. Полностью прочитанное тело HTTP-ответа подтверждает доступность BFF даже при статусе ошибки. Отклонение `fetch` или обрыв тела устанавливает `lost` и пробрасывает исключение. Событие `offline` поднимает предупреждение, а `online` запускает проверку через `/robots.txt` с `cache: 'no-store'`. Первый полный ответ после сбоя снимает предупреждение и показывает тост восстановления. Корневой макет оставляет текущий маршрут смонтированным и показывает сообщение о сети в `Snackbar`. [trpc.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/api/trpc.ts#L145-L155), [connection.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/connection.ts#L9-L48), [RootLayout.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/layouts/RootLayout.tsx#L8-L23), [Snackbar.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/components/Snackbar/Snackbar.tsx#L27-L41).

## Локальная проверка

`bun run preview` собирает production-клиент с локальным base и запускает BFF с локальными `assets/` и публичными файлами. Для проверки изменений сборку запускают повторно. Настройки origin и порта находятся в сценарии preview. [scripts/dev/preview.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/dev/preview.ts#L1-L30).

См. также [первый HTML](../architecture/request-flow.md), [сессию](session.md), [сохранение блокнота](../workflows/notebook.md) и [режимы разработки](../operations/development.md).
