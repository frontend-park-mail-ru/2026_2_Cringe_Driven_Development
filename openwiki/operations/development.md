---
type: operations
title: "Разработка, сборка и проверки"
description: "Команды Bun и Turbo, настройка Vite и BFF, границы локальных проверок и CI Check."
tags: [development, bun, vite, ci, testing]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-d912ecf3140dc3a8b821e706
    resource: repo://apps/bff/package.json
  - id: openwiki-source-910a4012648246d8f86752dd
    resource: repo://apps/bff/src/dev.ts
  - id: openwiki-source-94c7870b508e707b6ed4839c
    resource: repo://apps/bff/src/env.ts
  - id: openwiki-source-1a2d1d18ed01a2b88ddb7cd3
    resource: repo://apps/bff/src/index.ts
  - id: openwiki-source-3a2720e73343741beb2422cd
    resource: repo://apps/client/src/api/mockPrefer.ts
  - id: openwiki-source-9015e7a0ae6d197733d3d6dc
    resource: repo://apps/client/vite.config.dev.ts
  - id: openwiki-source-8aea975fb646f0975aee1831
    resource: repo://apps/client/vite.config.prod.ts
  - id: openwiki-source-066a6e13621f0ea862678416
    resource: repo://apps/client/vite/shared.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-8ed39f8987052529a3fb597d
    resource: repo://scripts/dev/preview.ts
  - id: openwiki-source-dbdde4eeae22f36f2a34532f
    resource: repo://scripts/dev/prism.ts
  - id: openwiki-source-440ae1e215cb02721dda855c
    resource: repo://turbo.json
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Разработка, сборка и проверки

## Запуск из корня

Монорепозиторий использует Bun workspaces `apps/*`, `packages/*` и Turborepo. Манифест требует Bun 1.4.0 и Node 22.19.0 или новее и закрепляет Bun 1.4.4. После `bun install` команда `bun run dev` запускает `turbo watch dev` для клиента и BFF. [package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/package.json#L1-L47), [turbo.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/turbo.json#L18-L33).

| Режим | Команда | Что запускается |
| --- | --- | --- |
| Разработка | `bun run dev` | Vite с HMR и BFF с явно заданным `GO_API_URL` |
| Примеры API | `bun run dev:prism` | Те же клиент и BFF с локальным Prism по закреплённой копии контракта |
| Проверка сборки и PWA | `bun run preview` | Production-сборка клиента и BFF с локальными ассетами, без HMR |
| Доверие сертификату из WSL | `bun run dev:trust-windows` | Установка доверия Windows к локальному CA mkcert |

Dev-конфигурация Vite включает HTTPS через mkcert, проксирует `/api/trpc` на BFF и получает HTML через `bffHtml`. BFF entrypoint для dev проверяет `GO_API_URL`, задаёт локальные значения по умолчанию для остальных настроек и импортирует обычный entrypoint. Скрипт Prism задаёт окружение обоих процессов, в том числе флаги для одноразового выбора статуса ответа через команду `mock` в консоли клиента. `preview` очищает параметры CDN для сборки и включает отдачу публичных файлов и `assets/` через BFF. [vite.config.dev.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/vite.config.dev.ts#L53-L84), [dev.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/dev.ts#L1-L19), [prism.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/dev/prism.ts#L13-L27), [mockPrefer.ts клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/api/mockPrefer.ts#L1-L38), [preview.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/dev/preview.ts#L1-L30), [локальные команды](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/docs/local-development.md#L68-L81).

## Конфигурация и выходы сборки

`env.ts` валидирует конфигурацию BFF и при ошибке выводит имена полей. BFF начинает принимать запросы после загрузки шаблона и публичных файлов. `SKIP_PUBLIC_FILES` отключает загрузку публичных файлов в обычном dev, а `SERVE_CLIENT_ASSETS` добавляет файлы из `assets/` в preview. Имена переменных и условия их применения приведены в конфигурации. [env.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/env.ts#L6-L50), [index.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/index.ts#L12-L29).

Vite берёт алиасы из tsconfig, применяет `VITE_STATIC_URL` в HTML и CSS и добавляет release-метатег. При наличии `RELEASE_SHA` и `CDN_URL` base клиентской сборки указывает на `releases/<sha>/`, иначе равен `/`. Сборка клиента попадает в `apps/client/dist/`, BFF — в `apps/bff/dist/bff.js`. [shared.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/vite/shared.ts#L19-L45), [vite.config.prod.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/vite.config.prod.ts#L4-L29), [apps/bff/package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/package.json#L9-L15).

## Проверки

| Область | Команда из корня |
| --- | --- |
| Формат, линт и типы | `bun run check` |
| Сборка клиента и BFF | `bun run build` |
| Доска задач, восстановление и соглашения workflow | `bun test scripts/release/test` |
| Шаблон HTML-вывода ячейки | `bun test apps/client/src/pages/NotebookPage/htmlDocument.test.ts` |

CI Check ставит зависимости с frozen lockfile, сверяет и проверяет закреплённый контракт, запускает release-тесты, `check`, `build` и проверяет упаковку образа BFF. Job публикации зависит от Check и доступен при push в main командного репозитория. [package.json](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/package.json#L9-L29), [CI](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/ci.yml#L23-L67), [htmlDocument.test.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/htmlDocument.test.ts#L1-L15), [recovery.test.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/test/recovery.test.ts#L18-L50).

См. [контракты](../integrations/contracts.md) для границ Prism и Go, [PWA](../concepts/offline.md) для правил SW и [выпуски](releases.md) для границы публикации и выкладки.
