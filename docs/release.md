# CI, синхронизация и выкатка фронтенда

## Рабочий репозиторий и учебная копия

Разработка и ревью проходят в [командном frontend](https://github.com/Cringe-Driven-Development-Team/frontend).
[Учебный репозиторий](https://github.com/frontend-park-mail-ru/2026_2_Cringe_Driven_Development)
получает те же коммиты `main`; его Actions выключены, PR и ревью туда не копируются.

Синхронизация включается переменной `COURSE_SYNC_ENABLED=true` после Check,
независимо от Publish release. Повторить её без выкатки: Actions → Sync to course,
ветка main, `ci_run_id` успешного push/main CI. Произвольный SHA не принимается.
Publish release, CD и Rollback доступны только в командном репозитории из main
при `PRODUCTION_ENABLED=true`. Отсутствующий flag означает выключенную операцию.
Порядок первого включения и отката — в
[runbook организации](https://github.com/Cringe-Driven-Development-Team/.github/blob/main/docs/migrations/team-repositories-runbook.md).

Если локальный клон всё ещё указывает на учебную копию, переключите remote:

```bash
git remote set-url origin https://github.com/Cringe-Driven-Development-Team/frontend.git
git fetch origin
git remote -v
```

## Выкатка

Выпуск коммита `main` — два артефакта одного SHA: ассеты клиента (JS, CSS, неперсональный
`index.html`) в S3 и на CDN в неизменяемом `releases/<sha>/` и **публичный** образ BFF в GHCR с
серверным бандлом и HTML того же коммита. На прод выкатывается образ по digest: HTML отдаёт
работающий BFF, S3-указателя и копии корневого `index.html` больше нет. Готовые выпуски и история
прода хранятся в GitHub Deployments. Шаги — команды `scripts/release/` (`bun run release <команда>`).

| Workflow   | Когда                                                 | Что делает                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI`       | pull request, Merge Queue и push в `main`             | `bun run check`, `bun run test`, `bun run build` — без production-секретов. На push в `main` ещё job `Publish release`: сборка с `RELEASE_SHA` и CDN base → заливка `releases/<sha>/` (неизменяемо) → Release check → образ BFF `sha-<sha>` в GHCR → анонимная проверка digest → запись `release-artifacts`; готовое сообщение отправляет `Release status` |
| `CD`       | вручную из `main`, вход `sha` (пусто — голова `main`) | готовый выпуск SHA → анонимная проверка образа → Release check → запись `production` → Telegram о начале → `deploy-bff.yml` из infra → Health check → итог записи → retention → Telegram                                                                                                                                                                   |
| `Rollback` | вручную: `Actions` → `Rollback` → `Run workflow`      | цель по истории `production` → те же проверки и тот же `deploy-bff.yml` → итог записи → Telegram                                                                                                                                                                                                                                                           |

`Release status` независимо обновляет доску и уведомления после CI/CD/Rollback,
при постановке PR в очередь и по ручному запуску; он не собирает и не выкатывает приложение.

### Готовые выпуски: `release-artifacts`

Job `Publish release` работает в environment `production` (ключ S3), но с
`environment.deployment: false`: заливка в CDN ещё не означает, что выпуск работает на VPS. Вместо
автоматической записи после проверки **обоих** артефактов скрипт создаёт явный Deployment:

| Поле          | Значение                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `environment` | `release-artifacts`, `production_environment: false`                                                                                     |
| `ref`         | полный SHA коммита                                                                                                                       |
| `task`        | `publish`                                                                                                                                |
| `payload`     | `{ "image_ref": "ghcr.io/cringe-driven-development-team/bff@sha256:…", "assets": "releases/<sha>/", "ci_run": "<ссылка на запуск CI>" }` |
| статус        | `success` с `auto_inactive: false`: успех прежних выпусков не становится `inactive`                                                      |

Успешная запись на SHA одна. Повторный CI того же SHA её находит и ничего не пересобирает; другой
digest того же SHA отклоняется. Ассеты неизменяемы: уже залитый релиз сверяется с новой сборкой
побайтно и не перезаписывается. Частично опубликованный выпуск (нет записи `success`) в CD не
попадает. Отдельного `release.json` в S3 нет.

Образ: `ghcr.io/cringe-driven-development-team/bff`, тег `sha-<полный SHA>` — только для поиска (он
может быть перезаписан повторной публикацией), выкатывается digest. Метка
`org.opencontainers.image.revision` — полный SHA: по ней CD и Ansible сверяют образ с релизом.
Package `bff` должен быть **публичным**: VPS скачивает образ без GHCR credentials. Перед
регистрацией выпуска CI получает анонимный токен GHCR и читает манифест по digest; приватный
package — выпуск не готов, job красный. При первой публикации package создаётся приватным:
GitHub → Packages → `bff` → Package settings → Change visibility → Public, затем `Re-run failed jobs`.

### Выкатка и история прода: `production`

`CD` и `Rollback` тоже работают с `environment.deployment: false` и пишут историю сами
(`deployments: write`). До изменения сервера:

1. единственная успешная запись `release-artifacts` выбранного SHA → `image_ref` и каталог ассетов;
2. анонимная доступность точного digest и метка `org.opencontainers.image.revision` = SHA;
3. Release check: `index.html` и все JS и CSS из него отдаются с CDN, JS — с CORS; без любого ассета прод не меняется.

Затем создаётся запись `production` (`ref` — SHA **выбранного образа**, в том числе при откате;
`payload` — `image_ref`, `assets`, `action` = `deploy`/`rollback`, `run` — ссылка на этот запуск) со
статусом `in_progress`, и запускается `ansible/deploy-bff.yml` из
[infra](https://github.com/Cringe-Driven-Development-Team/infra) на зафиксированной ревизии
(`INFRA_REF` в workflow) с `bff_image_ref` и `bff_release_sha` — без GHCR credentials. Ansible скачивает
образ анонимно, сверяет метку, переключает BFF и Caddy, проверяет, что запущен именно этот образ и он
`healthy` (внутренний `/health`), и пробу снаружи. После него Health check workflow:

- `https://cellestial.ru/login` — ровно один `<script id="bootstrap">` с `{"user":null}`,
  `<meta name="release">` этого SHA, `Cache-Control: private, no-store`;
- JS и CSS из HTML — с CDN `releases/<sha>/` и отдаются (чанк — с CORS);
- `users.me` без сессии — tRPC `UNAUTHORIZED` (401), `/api/unknown` — 404 не HTML.

Итог записи: `success` — только после всех проверок фактически запущенного выпуска; переключение было,
а проверка не прошла — `failure`; сбой до проверки результата или отмена — `error`. Workflow при
этом красный, а не ложно успешный. Выкатить: `Actions` → `CD` → `Run workflow` из `main`, в `sha` —
полный SHA из сообщения о заливке, либо `gh workflow run cd.yml -f sha=<sha>`.

### Откат

`Rollback` выбирает цель по истории `production` в GitHub **до доступа к VPS**, не по `.env`, Telegram
или тегу:

- последняя завершённая попытка `success` → предыдущий успешный выпуск с **другим** digest;
- последняя попытка `failure`/`error` → последний успешный выпуск (восстановление);
- последняя попытка незавершённая или без статуса, цели нет или у SHA в истории разные digest →
  остановка до изменений.

Цель сверяется с успешной записью `release-artifacts` (тот же digest), затем те же проверки образа и
ассетов и тот же `deploy-bff.yml`. Последний успешный Deployment — последний подтверждённый
результат проверки, а не гарантия того, что контейнер работает сейчас: отсутствующий или упавший
контейнер откат не блокирует, а после запуска Ansible проверяет фактический образ, здоровье и API.
Откат возвращает HTML и ассеты цели без пересборки. `SESSION_KEY` берётся из Vault и одинаков у
выкатки и отката: действительные cookie сессии остаются читаемыми. **Откат BFF не откатывает Go и
БД**; совместимость миграций оценивается отдельно.

### Retention

После успешной выкатки `CD` оставляет в S3 пять последних релизов и, независимо от возраста, ассеты
последнего успешного выпуска прода и предыдущего успешного с другим digest. Если последняя попытка
выкатки не `success`, очистка откладывается до следующего подтверждённого результата: попытка могла
переключить контейнер. Ассеты выпуска, который сейчас публикуется или выкатывается, входят в пять
последних.

### Очередь

`CD` и `Rollback` (вместе с retention внутри `CD`) — одна группа `concurrency: production` без
отмены: идущая выкатка не прерывается следующим запуском. В группе один идущий и один ожидающий
запуск; более новый ожидающий вытесняет прежнего (он отмечен `cancelled`, прод не менялся).
Публикации одного SHA сериализуются группой `publish-<sha>`.

### Telegram

Уведомления фронта отправляет существующий [webhook-сервис организации](https://github.com/Cringe-Driven-Development-Team/.github/tree/main/services/webhook-alerts), без запуска отдельного Actions sender:

- `pull_request.enqueued/dequeued` — актуальная постановка/снятие PR из main merge queue; MERGE не создаёт тревогу о снятии.
- `deployment_status` окружения `release-artifacts`, success — проверенный выпуск готов, есть кнопка «Выкатить».
- `production` in_progress — начало выкатки/отката непосредственно перед Switch BFF; вместо одного SHA показаны названия PR и логи.
- `production` success/failure/error — результат операции и Health Check ✅/❌/⚪.
- `workflow_job.completed` — ошибка/отмена до записи результата; после успешной выкатки сбой Retention показывается отдельным предупреждением.

Источники проверяются по репозиторию, workflow, SHA/digest и номеру попытки run.
Повторные и переставленные события не создают второй результат. Перед отправкой
и retry enqueue сервис проверяет текущие main-ветку и ID entry: влитый, закрытый
или снятый PR пропускается. Уже отправленные сообщения не удаляются. Очередь
обрабатывается отдельно от обогащения релизных карточек и не ждёт доску.

Сообщения сохраняют названия и ссылки задач, actor mentions, SHA/digest,
кнопки prod/rollback/logs. Для 1 PR есть кнопка PR, для 2–6 — PR #N по две в строке,
для >6 — «Все PR выпуска», ведущая на полный Summary исходного CI/CD/Rollback.
Длинный список сокращается только в Telegram. Ошибка состава не скрывает основной
результат и не выдаётся за отсутствие PR. При неполном Summary ссылки на «полный
список» нет. Сбой Telegram не влияет на выполнение CD/Rollback.

### Статусы задач и повтор синхронизации

`release-status.yml` сохраняется только для независимой job Board после завершения
CI/CD/Rollback и ручного запуска. В workflow нет enqueue-trigger, Telegram token
или журнала доставки. Board использует ADD_TO_PROJECT_PAT; webhook-сервис не имеет
Project PAT и не меняет карточки.

- Подтверждённый опубликованный выпуск переводит связанные закрытые Frontend/BFF
  задачи в Ready for release; успешно выкаченный — в Done.
- Учитываются фактический Git-граф, вложенные PR и вся история успешных выкаток;
  rollback не возвращает уже выкаченные задачи назад.
- Ручные статусы, ручное закрытие и переоткрытые задачи сохраняются. Неполный
  статус закрытия/автоматического Done может ожидаться до пяти минут.
- Красный CI из-за course-sync или CD из-за Retention не отменяет проверенные
  release-artifacts/production. Ошибка Project API не задерживает Telegram.

Для повторной сверки без выкатки:

```bash
gh workflow run release-status.yml -R Cringe-Driven-Development-Team/frontend --ref main
```

При ошибке проверить доступ ADD_TO_PROJECT_PAT, проект Scrumban №1, поле Status
и значения Ready for release/Done. Отсутствующая карточка даёт ошибку и не создаётся
этой сверкой автоматически. Очередь Board — отдельная группа release-board.

### Доставка и восстановление уведомлений

Журнал новых сообщений хранится в SQLite webhook-сервиса. Старые Deployments
`release-automation` сохраняются как история, новые больше не создаются и workflow
Board их не обрабатывает. Граница включения нового sender сохраняется отдельной
CLI-командой сервиса при согласованном переключении одного отправителя.

Подтверждённый Telegram 429 допускает retry. Timeout, 5xx и сбой сохранения после
принятия сообщения оставляют release_uncertain для ручной проверки без автоматического
повтора. Устаревшие сообщения помечаются release_skipped. Для адресного восстановления
есть release-recover <raw-delivery-id>, для проверенного отсутствия доставки —
retry <outbox-id>; подробности и snapshot-команды — в README webhook-сервиса.
Не сбрасывайте очередь целиком и не перепосылайте неизвестную доставку вслепую.

### Настройка

Environment `production` (`Settings` → `Environments`, только из `main`, правила одобрения не
меняются):

| Что        | Имя                      | Откуда                                                                   |
| ---------- | ------------------------ | ------------------------------------------------------------------------ |
| секрет     | `S3_ACCESS_KEY`          | `pulumi stack output s3AccessKey --show-secrets` (infra)                 |
| секрет     | `S3_SECRET_KEY`          | `pulumi stack output s3SecretKey --show-secrets` (infra)                 |
| секрет     | `DEPLOY_SSH_KEY`         | приватный ключ CI, его `.pub` — в `ansible/files/authorized_keys/` infra |
| секрет     | `SSH_KNOWN_HOSTS`        | host key `cellestial.ru`, сверенный по fingerprint из консоли            |
| секрет     | `ANSIBLE_VAULT_PASSWORD` | пароль `inventory/group_vars/all/vault.yml` infra                        |
| переменная | `S3_ENDPOINT`            | `pulumi stack output s3Endpoint`                                         |
| переменная | `S3_BUCKET`              | `pulumi stack output s3Bucket`                                           |
| переменная | `CDN_URL`                | `pulumi stack output cdnCustomDomain`                                    |

Environment `release-artifacts` создаётся первой записью сам; секретов в нём нет. GHCR credentials
для выкатки не нужны. Настройки Telegram release-потребителя хранятся в конфигурации
webhook-сервиса; CI/CD их для этой рассылки не используют.

> [!WARNING]
> Ключ S3 действует на весь проект Selectel, а не только на бакет релизов: ограничение
> environment веткой `main` снимать нельзя

### Отчёт операции для webhook-потребителя

`bun run release report <publish|deploy|rollback> <sha>` записывает состав конкретного
диапазона в Summary без Telegram. CI/CD передают outputs `report_base_sha` и
`report_url` в регистрацию операции; payload содержит `notification.base_sha`,
`notification.report_url` и положительный `notification.run_attempt`. Неизвестная
база или ошибка обогащения даёт неполный отчёт без ссылки «полный список» и не
мешает публикации или выкатке. Production record создаётся непосредственно перед
переключением BFF, после подготовки SSH и инструментов.
