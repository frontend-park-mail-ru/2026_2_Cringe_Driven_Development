---
type: operations
title: Разработка, сборка и проверки
description: Команды монорепозитория, dev-связка Vite и BFF, конфигурация запуска, тестовые границы и артефакты сборки.
tags: [development, testing, build, vite, bun]
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-6cc5e0fbf176f199e8324f4d
    resource: repo://apps/bff/bunfig.toml
  - id: openwiki-source-d912ecf3140dc3a8b821e706
    resource: repo://apps/bff/package.json
  - id: openwiki-source-910a4012648246d8f86752dd
    resource: repo://apps/bff/src/dev.ts
  - id: openwiki-source-94c7870b508e707b6ed4839c
    resource: repo://apps/bff/src/env.ts
  - id: openwiki-source-1a2d1d18ed01a2b88ddb7cd3
    resource: repo://apps/bff/src/index.ts
  - id: openwiki-source-7cd80694ee035fce8b8e9b73
    resource: repo://apps/bff/test/bff.test.ts
  - id: openwiki-source-4d2c2665072104dafecdc82b
    resource: repo://apps/client/test/connection.test.ts
  - id: openwiki-source-6cfb53ae8b37ef7f9a48d846
    resource: repo://apps/client/test/credentials.test.ts
  - id: openwiki-source-6ad8af232827e763157fb593
    resource: repo://apps/client/test/session.test.ts
  - id: openwiki-source-9015e7a0ae6d197733d3d6dc
    resource: repo://apps/client/vite.config.dev.ts
  - id: openwiki-source-8aea975fb646f0975aee1831
    resource: repo://apps/client/vite.config.prod.ts
  - id: openwiki-source-066a6e13621f0ea862678416
    resource: repo://apps/client/vite/shared.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-e930a7680374d071dc2088af
    resource: repo://scripts/dev/pwa.ts
generated: { by: "codex", at: "2026-11-02T21:57:05.254Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:57:05.254Z
---

# Разработка, сборка и проверки

Команды и поведение описаны по исходному SHA `d6bdf92f45c039c28dd82c69b1402485b995c222`. Наличие команды или зелёного CI не подтверждает её выполнение на проде.

## Запуск из корня

Монорепозиторий использует Bun workspaces `apps/*`, `packages/*` и Turborepo. В `package.json` указаны Bun не ниже 1.4.0, Node не ниже 22.19.0 и package manager Bun 1.4.4; CI устанавливает 1.4.4. Node нужен инструментам Vite. [Манифест](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/package.json#L1-L47), [локальные требования](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/docs/local-development.md#L1-L12).

```sh
bun install
bun run dev
```

`dev` запускает `turbo watch dev`: клиентский Vite и Bun BFF. Клиентская dev-конфигурация включает HTTPS через mkcert, прокси `/api/trpc` на BFF и `bffHtml(bffUrl)` для HTML. BFF dev-entrypoint задаёт локальные defaults и затем импортирует обычный `index.ts`. Значения адресов и ключей смотрят в конфигурации, не копируют из wiki. [Vite dev](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/vite.config.dev.ts#L57-L84), [BFF dev](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/dev.ts#L1-L11). В WSL отдельная команда `bun run dev:trust-windows` доверяет сертификат Windows; инструкция первого запуска — в `docs/local-development.md`.

## Проверки по области изменения

| Область | Команда из корня | Что проверяет |
| --- | --- | --- |
| Формат, lint, типы | `bun run check` | oxfmt, oxlint и tsc, включая scripts |
| Весь тестовый набор | `bun run test` | Пакетные тесты и scripts через Turbo |
| Сессия браузера | `bun run --filter @cdd/client test` | tRPC-клиент с управляемым fetch |
| HTML, CSRF, сессия BFF, Go-ошибки | `bun run --filter @cdd/bff test` | Обработчик BFF против fake Go |
| Служебные скрипты | `bun run test:scripts` | Bun-тесты scripts, включая wiki-checker |
| Сборка | `bun run build` | Сборки client и BFF |

Команды заданы в [корневом манифесте](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/package.json#L9-L29). BFF-тесты используют preload окружения из `apps/bff/bunfig.toml`, поэтому пакетная команда сохраняет правильный контекст запуска. [BFF scripts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/package.json#L9-L18), [preload](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/bunfig.toml#L1-L3).

Тесты BFF проходят через `createBff` и fake Go, проверяют HTML, CSRF и RPC; это не проверка реального Go или стенда. Клиентские тесты управляют `fetch`, чтобы воспроизводить перекрывающиеся смены сессии. Для изменения порядка авторизации особенно важны [сценарии клиента](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/session.test.ts#L1-L46) и [сценарии BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/bff.test.ts#L1-L23). `mock:check` — отдельная команда интеграции с mock, не замена обычному test.

## Конфигурация и сборка

BFF валидирует `SESSION_KEY`, `APP_ORIGIN`, `GO_API_URL`, порт и другие параметры при импорте `env.ts`. Неверная конфигурация завершает процесс и выводит только имена переменных. Перед `Bun.serve` entrypoint загружает и проверяет HTML-шаблон и публичные файлы; ошибка прерывает запуск. `SKIP_PUBLIC_FILES` позволяет пропустить список в обычном dev, `SERVE_CLIENT_ASSETS` добавляет файлы `assets/` при локальной проверке сборки. [Проверка конфигурации](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/env.ts#L6-L42), [старт BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/index.ts#L11-L28).

Vite получает алиасы из tsconfig, нормализует `VITE_STATIC_URL` для HTML/CSS и добавляет release-метатег. При наличии `RELEASE_SHA` и `CDN_URL` production-сборка использует base `releases/<sha>/`; иначе base остаётся `/`. Выход клиента — `dist`, с sourcemap; BFF собирается Bun в `dist/bff.js`. [Общий Vite config](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/vite/shared.ts#L20-L40), [prod config](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/vite.config.prod.ts#L4-L14), [BFF build](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/package.json#L9-L18).

CI `Check` выполняет frozen install, check, test и build. Публикация артефактов отделена от этой проверки и включается только для push main командного репозитория при `PRODUCTION_ENABLED`. Она собирает ассеты и образ BFF; наличие выпуска не доказывает его выкладку. [Check и условие публикации](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/ci.yml#L23-L52), [описание артефактов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/docs/release.md#L25-L43). Механизмы выпуска, выкатки, отката и доски разобраны в [автоматизации выпусков](releases.md); реализация переключения сервера принадлежит infra.

Смежные страницы: [quickstart](../quickstart.md), [HTML и маршруты](../architecture/request-flow.md), [сессия](../concepts/session.md), [контракты и frontend-packages](../integrations/contracts.md).

## Проверка PWA и новых сценариев

`bun run dev:pwa` собирает клиент без CDN base и запускает BFF с локальными ассетами, SW и манифестом. В этом режиме нет HMR, после изменений клиента нужен повторный запуск. Обычный `bun run dev` сохраняет HMR и не регистрирует SW. [PWA-скрипт](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/dev/pwa.ts#L1-L30), [регистрация](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/serviceWorker.ts#L1-L15). Конфигурация кеша и проверка соединения описаны в [PWA](../concepts/offline.md).

`connection.test.ts` проверяет сетевые отказы и полное получение тела, `credentials.test.ts` — требования нового пароля и его отличие от текущего. Дополнительно `session.test.ts` проверяет очередь смены пароля, а `bff.test.ts` — профиль и выдачу offline-файлов. [Клиентские проверки соединения](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/connection.test.ts#L18-L68), [правила нового пароля](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/credentials.test.ts#L1-L21), [сессия](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/session.test.ts#L155-L210), [BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/bff.test.ts#L466-L576).
