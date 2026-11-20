---
type: guide
title: "Карта frontend и точка входа"
description: "Как найти нужную реализацию Cellestial, запустить приложение и читать источники OpenWiki."
tags: [frontend, quickstart, architecture, openwiki]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-1abbe08666050ea8b9078ebb
    resource: repo://.github/workflows/cd.yml
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-9ae4567ebccf7e443e8fe185
    resource: repo://.github/workflows/reconcile-issues.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-eb237af3f199730f9b3e53e3
    resource: repo://apps/bff/src/bff.ts
  - id: openwiki-source-3e92e60d23010a2d3e62a3b5
    resource: repo://apps/bff/src/go/request.ts
  - id: openwiki-source-bf47c30b7933f3e39a4ad225
    resource: repo://apps/client/src/main.tsx
  - id: openwiki-source-d12a348ca362781d2dea0350
    resource: repo://apps/client/src/pages/NotebookPage/htmlDocument.test.ts
  - id: openwiki-source-457208b472a11630225995e7
    resource: repo://apps/client/src/pages/ProfilePage/ProfilePage.tsx
  - id: openwiki-source-b73fdb809a71fd814f05f6cd
    resource: repo://apps/client/sw/sw.ts
  - id: openwiki-source-b0297e82ef2c80516c64d1b2
    resource: repo://docs/api-contract.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-7d571db73f7bc6eb1ea8e5c6
    resource: repo://scripts/openwiki-check.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Карта frontend и точка входа

## Как читать wiki

1. Для вопроса о клиенте или BFF вызовите `openwiki_search`, затем откройте нужный раздел через `openwiki_read` с ID wiki из результата. Если ответа достаточно и противоречий нет, остановитесь.
2. При обычном чтении опубликованная wiki считается актуальной. За актуальность отвечает процесс обновления и публикации. К исходнику переходят при пробеле, противоречии или перед правкой. Явную ошибку инструмента учитывают при поиске. Простую правку известного файла можно начать с самого файла.
3. Без MCP откройте эту страницу и нужный Markdown-раздел с тем же правилом остановки. Если wiki отсутствует, используйте README, локальную документацию и исходники.

[AGENTS.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/AGENTS.md#L28-L60), [openwiki/INSTRUCTIONS.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/openwiki/INSTRUCTIONS.md#L38-L54).

`repo://` в Claims обозначает файл репозитория frontend на `gitHead` из [`.last-update.json`](.last-update.json). Ссылки на строки GitHub закреплены за тем же коммитом. Wiki и Claims производны от исходников. Перед изменением реализации сверяйте актуальный код. Проверка свежести через `scripts/openwiki-check.ts` относится к обслуживанию, генерации, CI и явной диагностике. Скрипт требует quickstart и завершённый checkpoint с полным SHA-предком, затем проверяет изменения корпуса до целевого SHA. Для состояния прода требуется отдельное свидетельство. [Правила корпуса](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/openwiki/INSTRUCTIONS.md#L9-L35), [scripts/openwiki-check.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/openwiki-check.ts#L4-L34), [проверка checkpoint](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/openwiki-check.ts#L40-L68), [сравнение SHA](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/openwiki-check.ts#L82-L102).

## Карта репозитория

Bun workspaces объединяет `apps/client`, `apps/bff` и общие пакеты. Клиент читает bootstrap перед первым рендером, берёт маршруты из общего `PAGES` и вызывает процедуры BFF через tRPC. BFF выдаёт HTML, обслуживает RPC и обращается к Go через серверную сессию и `@cdd-team/http-client`. В `packages/schemas` находятся общие схемы и ручные типы операций Go. [package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/package.json#L1-L29), [main.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/main.tsx#L18-L51), [pages.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/pages.ts#L1-L16), [bff.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/bff.ts#L17-L42), [go/request.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/request.ts#L1-L50), [docs/api-contract.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/docs/api-contract.md#L3-L29).

| Вопрос | Страница | Точка входа в код |
| --- | --- | --- |
| Прямой запрос, маршруты, первый рендер и загрузка блокнота | [Первый HTML](architecture/request-flow.md) | `apps/bff/src/html.ts`, `apps/client/src/bootstrap.ts`, `apps/client/src/routes/` |
| Cookie, CSRF, refresh, смена сессии | [Сессия](concepts/session.md) | `apps/bff/src/context.ts`, `apps/bff/src/session/`, `apps/client/src/api/trpc.ts` |
| Процедуры, ошибки Go, схемы и обновление контракта | [Контракты](integrations/contracts.md) | `apps/bff/src/router/`, `apps/bff/src/go/`, `packages/schemas/src/types.ts` |
| Сохранение, конфликты и удаление блокнота | [Редактирование блокнота](workflows/notebook.md) | `apps/client/src/stores/notebook/`, `apps/client/src/modules/notebookDelete/` |
| Подготовка окружения, очередь, опрос и вывод | [Выполнение ячеек](workflows/runtime.md) | `apps/client/src/stores/runtime.ts`, `apps/bff/src/router/runtime.ts` |
| Профиль, пароль, аватар и двухфакторная защита | [Профиль](workflows/profile.md) | `apps/client/src/pages/ProfilePage/`, `apps/bff/src/router/users.ts` |
| SW, офлайн-страница, потеря связи | [PWA](concepts/offline.md) | `apps/client/sw/sw.ts`, `apps/client/src/stores/connection.ts`, `apps/bff/src/public.ts` |
| Dev, Prism, preview, тесты и сборка | [Разработка](operations/development.md) | `package.json`, `apps/client/vite.config.*.ts`, `scripts/dev/` |
| Выпуски, выкатка, откат, доска и восстановление | [Автоматизация выпусков](operations/releases.md) | `.github/workflows/`, `scripts/release/` |

Профиль обновляет общий стор через `users.me`. PWA кеширует офлайн-страницу, её стили и шрифт. Автоматизация имеет отдельные точки входа для публикации выпуска, выкатки и восстановления карточек. [ProfilePage.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/ProfilePage.tsx#L25-L46), [sw.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/sw/sw.ts#L3-L19), [публикация](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/ci.yml#L48-L72), [CD](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/cd.yml#L3-L9), [восстановление](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/reconcile-issues.yml#L3-L28).

## Команды и тесты

Из корня начните с `bun install` и `bun run dev`. `bun run dev:prism` проверяет примеры API, а `bun run preview` запускает локально production-сборку с service worker. Базовые проверки — `bun run check` и `bun run build`. CI запускает `bun test scripts/release/test` для автоматизации выпусков. Шаблон HTML-вывода ячейки проверяет `bun test apps/client/src/pages/NotebookPage/htmlDocument.test.ts`. [package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/package.json#L9-L29), [CI Check](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/ci.yml#L23-L46), [htmlDocument.test.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/htmlDocument.test.ts#L1-L15).

## Соседние репозитории

Карта проекта находится в docs, Go — в backend, выкладка — в infra, реализация опубликованных `@cdd-team/*` — в frontend-packages. Для межрепозиторного поиска используйте настроенный workspace клонов docs, frontend, backend и infra. При нескольких пространствах проверьте `openwiki workspace current` и выберите нужное через `openwiki workspace use`. ID wiki из результата поиска указывает, в каком репозитории открыть раздел. [AGENTS.md](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/AGENTS.md#L43-L60).
