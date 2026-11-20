---
type: operations
title: "Публикация выпусков и автоматизация выкатки"
description: "Что проверяют CI, CD и Rollback, как записываются результаты и как они управляют карточками задач."
tags: [release, ci, cd, rollback, github]
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
  - id: openwiki-source-b83594803d250bdd7029f344
    resource: repo://.github/workflows/release-import.yml
  - id: openwiki-source-f16c1f7605091a182fce5ace
    resource: repo://.github/workflows/rollback.yml
  - id: openwiki-source-3da03557716a478498abad95
    resource: repo://scripts/release/board.ts
  - id: openwiki-source-cb4f01892561eeec9005ec5e
    resource: repo://scripts/release/checks.ts
  - id: openwiki-source-69c0c3b10e34b74534a3f9ae
    resource: repo://scripts/release/deployments.ts
  - id: openwiki-source-38bd281644c533d1a8998ca6
    resource: repo://scripts/release/image.ts
  - id: openwiki-source-073840cc738879ec0c021b1b
    resource: repo://scripts/release/import.ts
  - id: openwiki-source-190247741c4b1f05088abd00
    resource: repo://scripts/release/recovery.ts
  - id: openwiki-source-ff9b39f91b4e5fc7ea1487c5
    resource: repo://scripts/release/releases.ts
  - id: openwiki-source-fb80a1dedc36f1f9151525d5
    resource: repo://scripts/release/report.ts
  - id: openwiki-source-5c53c43e4e3ee80dcd821460
    resource: repo://scripts/release/retention.ts
  - id: openwiki-source-73fb71a0cdf63104fa23d5c1
    resource: repo://scripts/release/upload.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Публикация выпусков и автоматизация выкатки

## Готовый выпуск и запись production

Готовый выпуск — опубликованный immutable GitHub Release `release-<SHA>`. В нём `release.json`, `frontend-dist.tar.gz`, `bff-image.tar.gz` и `SHA256SUMS`. Проверка сверяет фактический SHA тега, комплект и размеры файлов, суммы с digest GitHub, содержимое манифеста и происхождение сборки. Манифест связывает SHA, образ по digest, каталог `releases/<sha>/` и исходную попытку CI. `production` Deployment хранит выбранный SHA, ID Release, образ, каталог, действие, запуск workflow и результат конкретной операции. [releases.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/releases.ts#L13-L35), [проверка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/releases.ts#L291-L348), [deployments.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L166-L209).

## Публикация CI

`Publish release` выполняется после Check для push в main командного репозитория. Новый выпуск собирается с release base. CI загружает ассеты, проверяет CDN и анонимное чтение образа по digest с меткой `org.opencontainers.image.revision`, соответствующей SHA. Уже заполненный каталог сверяется побайтно. Для нового каталога `index.html` загружается последним. [ci.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/ci.yml#L48-L127), [upload.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/upload.ts#L31-L76), [image.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/image.ts#L91-L107).

Публикация создаёт draft, фиксирует его состав в `release.json`, загружает архивы и суммы и проверяет комплект до публикации. При повторном запуске с зафиксированным draft CI продолжает с тем же образом и сборкой. Для готового Release повторяются отчёт и обработка доски. Проверка происхождения сверяет репозиторий, main, событие, workflow и попытку запуска. [ci.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/ci.yml#L85-L153), [releases.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/releases.ts#L429-L453), [publishRelease](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/releases.ts#L503-L617), [catalog.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/catalog.ts#L22-L63).

`Release import` может оформить последний успешный production и предыдущий с другим digest как GitHub Releases. Для этого он сверяет успешные `release-artifacts` с production, проверяет исходную попытку CI и доступность ассетов. [release-import.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/release-import.yml#L7-L44), [import.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/import.ts#L35-L109).

## CD, Rollback и проверки

CD запускается вручную из main. Вход `release` задаёт точный тег. Пустой вход выбирает первый опубликованный выпуск при обходе first-parent истории main от головы. Перед переключением CD проверяет Release, направление в Git-графе, образ и ассеты. Обычная выкатка разрешена на тот же SHA или потомка последней подтверждённой версии. [cd.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/cd.yml#L3-L9), [подготовка CD](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/cd.yml#L47-L80), [releases.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/releases.ts#L369-L427), [deployments.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L20-L37).

Rollback после последнего успеха выбирает предшествующий успешный образ с другим digest, после `failure` или `error` — последний успешный. Отсутствие цели, незавершённая попытка и неоднозначность digest останавливают операцию. Откат сверяет выбранную цель с её Release и проверяет, что SHA является предком или совпадает с базой. [deployments.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L64-L104), [сверка цели](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L136-L157), [rollback.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/rollback.yml#L46-L67).

Перед вызовом `deploy-bff.yml` из infra обе операции записывают `production: in_progress`. После переключения Health check определяет итог. `success` означает, что проверка прошла, `failure` означает, что переключение прошло без успешной проверки, а `error` означает сбой до проверки результата. [cd.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/cd.yml#L117-L156), [rollback.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/rollback.yml#L108-L150).

Release check проверяет метку SHA, JS, CSS, их MIME-типы и CORS для JS. Health check повторяет проверку ассетов через HTML сайта, проверяет единственный гостевой bootstrap на `/login`, `private, no-store`, tRPC `UNAUTHORIZED` без сессии, 404 без HTML для неизвестного API и отказ `invalid_credentials` от Go при проверке входа. Это условия выполнения workflow. Состояние окружения устанавливают по отдельному свидетельству. [checks.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/checks.ts#L26-L90), [Health check](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/checks.ts#L93-L165).

Общая очередь `release-board` сериализует публикацию, CD, Rollback, импорт и восстановление карточек без отмены текущего запуска. Retention сохраняет пять последних каталогов ассетов и каталоги последнего успешного образа и предыдущего успешного с другим digest. При неподтверждённой последней попытке очистка откладывается. [ci.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/ci.yml#L65-L72), [cd.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/cd.yml#L34-L41), [rollback.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/rollback.yml#L28-L34), [release-import.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/release-import.yml#L23-L29), [reconcile-issues.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/reconcile-issues.yml#L22-L28), [retention.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/retention.ts#L6-L52), [защищённые каталоги](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L106-L123).

## Отчёт и карточки задач

`release report` формирует диапазон PR и задач и пишет Summary. Ошибка обогащения оставляет неполный отчёт без ссылки на полный Summary. Payload production содержит базовый SHA, номер попытки и ссылку Summary, если она доступна. Board требует полный отчёт и сверяет его диапазон с Release либо с подтверждённым Deployment. [report.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/report.ts#L192-L197), [формирование отчёта](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/report.ts#L259-L303), [метаданные](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L39-L51), [board.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/board.ts#L279-L360).

| Операция | Действие с подходящей связанной задачей |
| --- | --- |
| Публикация | Открытая задача получает `Ready for release` |
| CD после Health check и записи production success | Задача закрывается с причиной completed, после подтверждения получает `Done` |
| Rollback после подтверждённого успеха | Удаляемые из production изменения получают `Rollback from production`; состояние закрытия сохраняется |

Board проверяет последний связанный merge по Git-графу, ручные закрытия с другой причиной и переоткрытия после merge. Перед записью перечитывает карточку, связи и production. Отсутствие карточки или неподтверждённая запись дают ошибку. Для Rollback требуется доказанное прежнее присутствие merge в production. [board.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/board.ts#L353-L360), [допуск](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/board.ts#L389-L449), [запись и сверка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/board.ts#L453-L546).

`Reconcile release issues` получает исходный Deployment ID, сверяет исходную и последнюю production-операции, восстанавливает диапазон отчёта и повторяет только изменения карточек. Последняя операция должна иметь `success`, а проверка актуального production блокирует запись, если более поздняя операция уже изменила применимость исходного результата. [reconcile-issues.yml](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/.github/workflows/reconcile-issues.yml#L3-L44), [recovery.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/recovery.ts#L6-L25), [deployments.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/deployments.ts#L212-L268), [board.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/board.ts#L426-L449).

Тесты проверяют повтор после частичного обновления, поздний откат и общую очередь workflow. Команды проверки находятся в [разработке](development.md), HTML и RPC описаны в [архитектуре](../architecture/request-flow.md). [recovery.test.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/test/recovery.test.ts#L18-L71), [workflows.test.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/scripts/release/test/workflows.test.ts#L85-L111).
