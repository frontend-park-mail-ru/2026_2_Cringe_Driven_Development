---
type: operations
title: Публикация выпусков и автоматизация выкатки
description: Как frontend связывает ассеты и образ одного SHA, проверяет выкатку и откат, сохраняет Deployments и независимо сверяет доску задач.
tags: [release, ci, cd, rollback, deployments, automation]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:50:56.050Z
sources:
  - id: openwiki-source-1abbe08666050ea8b9078ebb
    resource: repo://.github/workflows/cd.yml
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-e0040568b86cfc8934ad9a70
    resource: repo://.github/workflows/release-status.yml
  - id: openwiki-source-f16c1f7605091a182fce5ace
    resource: repo://.github/workflows/rollback.yml
  - id: openwiki-source-3da03557716a478498abad95
    resource: repo://scripts/release/board.ts
  - id: openwiki-source-5400861c9aad7188bb085b15
    resource: repo://scripts/release/catalog.ts
  - id: openwiki-source-cb4f01892561eeec9005ec5e
    resource: repo://scripts/release/checks.ts
  - id: openwiki-source-69c0c3b10e34b74534a3f9ae
    resource: repo://scripts/release/deployments.ts
  - id: openwiki-source-38bd281644c533d1a8998ca6
    resource: repo://scripts/release/image.ts
  - id: openwiki-source-fb80a1dedc36f1f9151525d5
    resource: repo://scripts/release/report.ts
  - id: openwiki-source-5c53c43e4e3ee80dcd821460
    resource: repo://scripts/release/retention.ts
  - id: openwiki-source-58698e61f4d6301a548ead2f
    resource: repo://scripts/release/source.ts
  - id: openwiki-source-73fb71a0cdf63104fa23d5c1
    resource: repo://scripts/release/upload.ts
generated: { by: "codex", at: "2026-11-02T21:50:56.050Z" }
---

# Публикация выпусков и автоматизация выкатки

Это описание механизмов на SHA `d6bdf92f45c039c28dd82c69b1402485b995c222`. Здесь не проверяются GitHub Deployments, сервер, облако или текущая версия прода. Реализация Ansible находится в infra; frontend задаёт её вызов и проверяет HTTP-результат.

## Два вида результата

| Результат | Источник состояния | Связанные артефакты |
| --- | --- | --- |
| Готовый выпуск | `release-artifacts` Deployment со статусом `success` | Полный SHA, `image_ref` по digest, `assets: releases/<sha>/`, исходный CI run |
| Попытка выкатки или отката | `production` Deployment | SHA выбранного образа, digest, каталог ассетов, `action`, исходный run, итог проверки |

`readyArtifacts` отвергает разные digest одного SHA и неверный каталог ассетов. `register` допускает повтор того же выпуска, но не подмену образа на том же SHA. Объекты S3 хранят ассеты; указателя текущего релиза в S3 нет. [Проверка выпуска](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L34-L62), [регистрация](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L167-L199), [production payload](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L234-L260).

## Публикация из CI

После `Check` job `Publish release` разрешена только push в main командного репозитория с `PRODUCTION_ENABLED`. Она проверяет, не опубликован ли SHA, собирает release base, загружает ассеты, проверяет CDN, публикует образ, проверяет анонимное чтение digest и регистрирует готовый выпуск. Повторная публикация SHA сериализована группой `publish-<sha>`. Environment `production` предоставляет настройки, но `deployment: false` отключает автоматическую запись выкатки. [Условия и шаги](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/ci.yml#L36-L123).

`upload` сверяет уже завершённый каталог с новой сборкой побайтно и отказывается перезаписывать отличный файл. При новой загрузке `index.html` записывается последним. `checkImage` проверяет доступность без credentials и метку `org.opencontainers.image.revision`, равную SHA. [Загрузка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/upload.ts#L31-L78), [образ](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/image.ts#L85-L99).

## Выкатка и откат

`CD` запускается вручную из main: вход `sha`, по умолчанию SHA запуска. До переключения он требует готовый выпуск, проверяет образ и CDN. Затем получает зафиксированную ревизию infra, готовит инструменты и секреты, создаёт `production: in_progress` и вызывает `ansible/deploy-bff.yml` с `bff_image_ref` и `bff_release_sha`. После переключения запускает Health check. Итог — `success` при успешной проверке; `failure`, если переключение прошло, а проверка нет; иначе `error`. Это условия workflow, а не свидетельство их выполнения. [CD](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/cd.yml#L40-L134).

Release check проверяет метку SHA и JS/CSS из HTML на CDN, включая CORS для JS. Health check после переключения проверяет `/login`: один bootstrap `{"user":null}`, `private, no-store`, нужный release SHA и доступные ассеты; затем гостевой `users.me` должен дать tRPC `UNAUTHORIZED`, неизвестный API — 404 без HTML. [Проверки](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/checks.ts#L23-L149). Путь выдачи HTML описан в [архитектуре](../architecture/request-flow.md).

`Rollback` выбирает цель по истории `production` до обращения к серверу. После последнего успеха берётся предыдущий успешный digest; после `failure`/`error` — последний успешный. Незавершённая попытка, отсутствие цели и неоднозначный SHA останавливают операцию. Цель дополнительно сверяется с `release-artifacts`; затем используется тот же Ansible entrypoint и Health check, без пересборки. [Выбор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L74-L114), [сверка цели](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L212-L232), [workflow](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/rollback.yml#L39-L124).

CD и Rollback используют одну группу `production` без отмены текущего запуска. После успешной выкатки CD запускает retention: сохраняются пять последних каталогов и ассеты последнего успешного выпуска и предыдущего с другим digest. Если последняя попытка не `success`, очистка откладывается. [Очередь CD](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/cd.yml#L27-L34), [очередь Rollback](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/rollback.yml#L23-L28), [retention](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/retention.ts#L6-L51), [защита каталогов](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L116-L133).

## Отчёт и независимая сверка доски

`release report` формирует Summary состава операции. Ошибка обогащения даёт неполный отчёт без ссылки на полный Summary и не отменяет основную операцию. В Deployment передаются `notification.base_sha`, `report_url` и положительный `run_attempt`; URL проверяется относительно текущего run. Доставку Telegram локальная документация относит к webhook-сервису организации; его реализация вне этого корпуса. [Summary и обработка сбоя](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/report.ts#L103-L187), [метаданные](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.ts#L19-L32), [граница уведомлений](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/docs/release.md#L129-L137).

`Release status` выполняет только Board после завершения CI/CD/Rollback либо вручную. Отдельная группа `release-board` и Project PAT позволяют повторить сверку без выкатки. `readAutomationSource` проверяет репозиторий, main и источник Actions; `readReleaseCatalog` проверяет workflow ID, SHA/digest и принадлежность PR Git-графу. Общий conclusion workflow не заменяет успешные записи артефактов и выкаток. [Workflow](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/.github/workflows/release-status.yml#L1-L42), [допуск](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/source.ts#L8-L39), [каталог](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/catalog.ts#L57-L92).

Для связанных задач Frontend/BFF публикация даёт `Ready for release`, успешная выкатка — `Done`. Каталог учитывает все успешные выкатки, поэтому откат не возвращает уже выкаченные задачи назад. Board сохраняет ручные статусы, ручное закрытие и переоткрытия, ждёт подтверждения закрытия до пяти минут, повторно читает состояние перед mutation. Отсутствующая карточка — ошибка. [Правила Board](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/board.ts#L228-L340), [история выкаток](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/catalog.ts#L290-L325).

## Проверки и точки изменения

CLI-команды сведены в `scripts/release/index.ts`. Для изменения выбора отката и retention важен `deployments.test.ts`; доверия к записям и Git-графу — `catalog.test.ts`; ручных статусов и гонок — `board.test.ts`; разделения Board и уведомлений — `sync.test.ts`, `workflows.test.ts`. [Выбор и защита](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/deployments.test.ts#L28-L90), [границы автоматизации](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/scripts/release/workflows.test.ts#L36-L52). Команды тестов — в [разработке](development.md), корневые публичные PWA-файлы — в [PWA](../concepts/offline.md), карта — в [quickstart](../quickstart.md).
