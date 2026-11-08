# CI, синхронизация и выкатка фронтенда

## Рабочий репозиторий и учебная копия

Разработка и ревью проходят в [командном frontend](https://github.com/Cringe-Driven-Development-Team/frontend).
[Учебный репозиторий](https://github.com/frontend-park-mail-ru/2026_2_Cringe_Driven_Development)
получает те же коммиты `main`; его Actions выключены, PR и ревью туда не копируются.

Синхронизация запускается на push в `main` после Check, независимо от Publish release.
Повторить её без выкатки: Actions → Sync to course, ветка main, `ci_run_id` успешного
push/main CI. Произвольный SHA не принимается. Publish release, CD и Rollback доступны
только в командном репозитории из main.

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
работающий BFF, S3-указателя и копии корневого `index.html` больше нет. Готовые выпуски — GitHub
Releases (один на SHA, скачиваемые сборка клиента и образ BFF), история прода — GitHub Deployments. Шаги — команды `scripts/release/` (`bun run release <команда>`).

| Workflow   | Когда                                            | Что делает                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI`       | pull request, Merge Queue и push в `main`        | `bun run check`, `bun run build`, локальная сборка образа BFF — без production-секретов. На push в `main` ещё job `Publish release`: сборка с `RELEASE_SHA` и CDN base → заливка `releases/<sha>/` (неизменяемо) → Release check → образ BFF `sha-<sha>` в GHCR → анонимная проверка digest → GitHub Release `release-<sha>` (draft → assets → publish); статус задач обновляется внутри CI, сообщение отправляет webhook-сервис |
| `CD`       | вручную из `main`, input `release` — тег Release | проверка выбранного Release → анонимная проверка образа → Release check → запись `production` → Telegram о начале → `deploy-bff.yml` из infra → Health check → итог записи → retention → Telegram                                                                                                                                                                                                                                |
| `Rollback` | вручную: `Actions` → `Rollback` → `Run workflow` | цель по истории `production` → сверка с её Release → те же проверки и тот же `deploy-bff.yml` → итог записи → Telegram                                                                                                                                                                                                                                                                                                           |

Статусы задач обновляются шагами CI/CD/Rollback после успешной операции.
Уведомления о готовности выпуска webhook-сервис отправляет по событию `release.published`, о выкатке и
откате — по GitHub Deployments `production`.

Образ BFF собирается в `Check` на каждом событии CI и никуда не отправляется. Повторить локально
вместе со сборкой клиента и BFF: `bun run image`.

### Готовые выпуски: GitHub Releases

Каталог выпусков — [Releases](https://github.com/Cringe-Driven-Development-Team/frontend/releases).
Один Release на полный SHA: тег `release-<40 hex>`, заголовок `Frontend <короткий SHA>`, SemVer нет.
Job `Publish release` работает в environment `production` (ключ S3) с `environment.deployment: false`
и после проверки S3/CDN и GHCR публикует Release через `GITHUB_TOKEN` (`contents: write` — только у
этого job). Успех выкатки для публикации не нужен. Отдельного `on: release` workflow нет.

| Asset                  | Содержимое                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `frontend-dist.tar.gz` | всё содержимое `apps/client/dist/` с относительными путями (HTML, JS/CSS, PWA), те же байты, что в CDN         |
| `bff-image.tar.gz`     | gzip `docker image save` опубликованного linux/amd64 образа `sha-<SHA>`; runtime, bundle и HTML входят в образ |
| `release.json`         | состав и происхождение выпуска                                                                                 |
| `SHA256SUMS`           | SHA-256 трёх файлов выше в формате `sha256sum`                                                                 |

`release.json` — машиночитаемый состав (описание Release редактируемое и доказательством не считается):

| Поле                       | Значение                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `sha`                      | полный SHA, совпадающий с тегом и меткой образа                                              |
| `image_ref`                | только `ghcr.io/cringe-driven-development-team/bff@sha256:<64 hex>`                          |
| `image_id`                 | config digest образа (image ID Docker), прочитанный из GHCR                                  |
| `assets`                   | строго `releases/<sha>/`                                                                     |
| `ci_run`, `ci_run_attempt` | push/main CI и его попытка, подготовившие файлы и образ                                      |
| `publication_run`          | run, завершивший публикацию; у обычного выпуска совпадает с `ci_run`, у импорта — import run |
| `notification.base_sha`    | предыдущий опубликованный first-parent предок для отчёта или `null`                          |
| `notification.report_url`  | `<publication_run>#summary` или `null` при неполном отчёте                                   |
| `notification.run_attempt` | попытка публикации                                                                           |

Порядок: draft на точном SHA → `release.json` (с ним состав зафиксирован) → архивы → `SHA256SUMS` по
digest GitHub → проверка draft → publish → повторное чтение и полная проверка. Архив клиента после
распаковки сверяется с dist; для образа config в архиве и image ID после `docker load` равны
config digest GHCR, метка — SHA. Каждый asset строго меньше 2 GiB, иначе публикация останавливается
без разбиения. Секретов, env и персонального bootstrap в assets нет.

Готовым считается только **published immutable** Release с полным комплектом; draft, prerelease и
неполный выпуск CD не принимает. Проверка (CD, Rollback, база отчёта, повтор CI): фактический SHA
тега, ровно четыре asset, размеры, `SHA256SUMS` против digest GitHub, сумма и поля `release.json`,
источник CI (repository, `ci.yml`, `push`, `main`, SHA, attempt). Бинарные архивы при этом не
скачиваются. `Latest` — последний опубликованный выпуск, а **не** текущий production: что работает
на проде, показывает история `production`.

Повторный CI того же SHA перепроверяет опубликованный Release и пропускает публикацию без новой
версии и повторного ready. Описание формируется из отчёта публикации (SHA, изменения, PR/задачи,
CI, `docker pull` по digest, проверка сумм); при сбое отчёта в нём явно указан неполный состав, а
проверенные артефакты всё равно публикуются. Автоматические Source code (zip/tar.gz) — исходники,
не сборка.

Проверить скачанный выпуск:

```sh
sha256sum -c SHA256SUMS
gunzip -c bff-image.tar.gz | docker load   # Loaded image: ghcr.io/…/bff:sha-<SHA>
mkdir dist && tar -xzf frontend-dist.tar.gz -C dist
```

#### Восстановление draft

Упавший после создания draft CI перезапускается (`Re-run jobs`). Шаг `Published already` находит
draft с `release.json`: сборка, заливка и push образа пропускаются, недостающие архивы собираются из
сохранённого S3 `releases/<sha>/` и точного GHCR digest. Новая попытка меняет только
`publication_run`, `notification` и суммы изменившегося `release.json`; `ci_run`/`ci_run_attempt` и
артефакты остаются прежними. Обрыв publish разрешается повторным чтением Release; после сбоя
upload удаляется только незавершённый asset этой операции. Draft **без** `release.json` — состав не
зафиксирован: сверьте S3 и образ GHCR, удалите draft вручную (`gh release delete release-<sha>`, тег
у draft ещё не создан) и перезапустите CI.

Образ: `ghcr.io/cringe-driven-development-team/bff`, тег `sha-<полный SHA>` — только для поиска (он
может быть перезаписан повторной публикацией), выкатывается digest. Метка
`org.opencontainers.image.revision` — полный SHA: по ней CD и Ansible сверяют образ с релизом.
Package `bff` должен быть **публичным**: VPS скачивает образ без GHCR credentials. Перед
публикацией Release CI получает анонимный токен GHCR и читает манифест по digest; приватный
package — выпуск не готов, job красный. При первой публикации package создаётся приватным:
GitHub → Packages → `bff` → Package settings → Change visibility → Public, затем `Re-run failed jobs`.

### Выкатка и история прода: `production`

`CD` и `Rollback` тоже работают с `environment.deployment: false` и пишут историю сами
(`deployments: write`). До изменения сервера:

1. выбранный published immutable Release (проверка выше) → SHA, `image_ref`, каталог ассетов и `release_id`;
2. анонимная доступность точного digest и метка `org.opencontainers.image.revision` = SHA;
3. Release check: `index.html` и все JS и CSS из него отдаются с CDN с типом JS или CSS, JS — с CORS; без любого ассета прод не меняется.

Затем создаётся запись `production` (`ref` — SHA **выбранного образа**, в том числе при откате;
`payload` — `image_ref`, `assets`, `action` = `deploy`/`rollback`, `run` — ссылка на этот запуск,
`notification` и числовой `release_id`) со статусом `in_progress` (`environment_url` —
`https://cellestial.ru`, `log_url` — текущий run); у каждой попытки своя запись, и запускается `ansible/deploy-bff.yml` из
[infra](https://github.com/Cringe-Driven-Development-Team/infra) из актуального `main` с `bff_image_ref` и `bff_release_sha` — без GHCR credentials. Ansible скачивает
образ анонимно, сверяет метку, переключает BFF и Caddy, проверяет, что запущен именно этот образ и он
`healthy` (внутренний `/health`), и пробу снаружи. После него Health check workflow:

- `https://cellestial.ru/login` — ровно один `<script id="bootstrap">` с `{"user":null}`,
  `<meta name="release">` этого SHA, `Cache-Control: private, no-store`;
- JS и CSS из HTML — с CDN `releases/<sha>/` и отдаются с типом JS или CSS (чанк — с CORS);
- `users.me` без сессии — tRPC `UNAUTHORIZED` (401), `/api/unknown` — 404 не HTML;
- `auth.login` со случайными логином и паролем — 400, tRPC `BAD_REQUEST` и
  `appCode=invalid_credentials`: отказ Go подтверждает BFF, S2S и обработчик входа. Пользователь и
  сессия не создаются.

Итог записи: `success` — только после всех проверок фактически запущенного выпуска; переключение было,
а проверка не прошла — `failure`; сбой до проверки результата или отмена — `error`. Workflow при
этом красный, а не ложно успешный. Ошибка карточек или retention успех выкатки не отменяет.

Выкатить: скопируйте тег со страницы Release (`release-<полный SHA>`), затем `Actions` → `CD` →
`Run workflow` из `main` с input `release`, либо
`gh workflow run cd.yml --ref main -f release=release-<SHA>`. Workflow исполняется из `main`, целевой
SHA берётся из Release и может отличаться от SHA workflow. Направление сохраняется: тот же SHA или
потомок последнего подтверждённого production; возврат к предку — только `Rollback`. Без
опубликованного Release, CDN-ассетов или публичного образа CD останавливается до VPS.

### Откат

`Rollback` выбирает цель по истории `production` в GitHub **до доступа к VPS**, не по `.env`, Telegram
или тегу:

- последняя завершённая попытка `success` → предыдущий успешный выпуск с **другим** digest;
- последняя попытка `failure`/`error` → последний успешный выпуск (восстановление);
- последняя попытка незавершённая или без статуса, цели нет или у SHA в истории разные digest →
  остановка до изменений.

Цель сверяется с её GitHub Release (тот же digest, полная проверка; старые записи `production` без
`release_id` — по SHA и digest), затем те же проверки образа и
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
последних. Release assets очистка не трогает: если у старого Release уже нет CDN-каталога или образа,
CD остановится до VPS; S3/GHCR из архивов автоматически не восстанавливаются.

### Импорт

Разовый перенос при переходе на Releases — workflow `Release import` (`release-import.yml`, вручную из
`main`): только последний подтверждённый production и предыдущий успешный с другим digest. Более
поздняя `failure`/`error` выбор не блокирует (в отличие от паузы retention). Источник — прежние записи `production`/`release-artifacts` и фактически
сохранённые S3 `releases/<sha>/` и GHCR digest; архивы собираются из них без пересборки. Расхождение
digest, источника CI или недоступность CDN/образа останавливают перенос. `ci_run_attempt` — исходная
попытка из записи `release-artifacts` (`notification.run_attempt`), проверенная через
`/actions/runs/{id}/attempts/{n}`, а не последняя попытка run; без неё перенос останавливается.
`ci_run`/`ci_run_attempt` указывают старую сборку, `publication_run` и `notification` — import run (`base_sha` и
`report_url` — `null`). Повтор проверяет и пропускает уже перенесённые выпуски. Массового импорта
истории нет; отсутствие Release у невыбранных старых записей чтение истории не ломает.

Порядок перехода:

1. Включить immutable releases репозитория (`Settings` → `General` → `Releases` → `Enable release
immutability`) — до первого выпуска нового формата.
2. Слить frontend и consumer; запустить `Release import` до переключения webhook-потребителя:
   импортированные выпуски не рассылают повторный ready.
3. Переключить consumer и подписку org webhook на `Releases` по README webhook-сервиса; граница
   нового контракта отсекает опоздавшие delivery импорта. SQLite дедупликацию не сбрасывать.
4. Общая проверка: push/main → Release, CD по тегу, Rollback.

### Очередь

Publish release, CD и Rollback вместе с обновлением карточек используют общую
job concurrency-группу `release-board`, `queue: max`, `cancel-in-progress: false`.
Обработчик frontend `issues.closed` использует ту же группу. Операции выполняются
последовательно: публикация, выкатка и закрытия иногда ждут друг друга. Проверки
Check для PR остаются независимыми. Порядок ожидания не гарантирует хронологию,
поэтому перед записью проверяется актуальный цикл закрытия. GitHub допускает до
100 ожидающих jobs; отменённый сверх лимита close job нужно повторить адресно.

### Telegram

Уведомления фронта отправляет существующий [webhook-сервис организации](https://github.com/Cringe-Driven-Development-Team/.github/tree/main/services/webhook-alerts), без запуска отдельного Actions sender:

- `pull_request.enqueued/dequeued` — актуальная постановка/снятие PR из main merge queue; MERGE не создаёт тревогу о снятии.
- `release.published` — проверенный immutable Release готов, есть ссылка на страницу выпуска.
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

### Статусы задач и восстановление

Карточки обновляются шагом `release board` внутри доверенных main jobs после успеха
операции. Состав вычисляет `release report` один раз и сохраняет в локальном JSON
`${{ runner.temp }}/release-report.json`; шаг карточек читает этот же отчёт.
ADD_TO_PROJECT_PAT доступен только шагу карточек, webhook-сервис его не получает.
Отдельного workflow полной сверки и автоматического ремонта исторических карточек нет.

1. Merge PR в default branch закрывает frontend-задачу; общий обработчик `.github`
   ставит Ready for build, пока сборка и публикация ещё могут идти.
2. После проверки статики S3 и образа BFF GHCR успешный Register release ставит
   Ready for release задачам диапазона от последнего опубликованного предка до SHA.
   Уже опубликованный SHA пропускает публикацию и карточки. Поздняя публикация
   сохраняет Done и Rollback from production текущего цикла закрытия.
3. После Health check и успешного Production result CD ставит Done задачам диапазона
   от последнего подтверждённого production до выбранного SHA. Rollback ставит
   Rollback from production задачам обратного диапазона — удаляемым изменениям.
   Последующий CD снова поставит Done. Задачи вне отчёта не читаются и не меняются.

CD разрешает тот же SHA или потомка подтверждённого production, Rollback — предка
или тот же SHA при восстановлении. Направление проверяется по Git до доступа к VPS
и записи production. Неизвестная база или разошедшиеся ветки останавливают операцию.
После A → B → откат на A повторный Rollback, выбравший B, завершится ошибкой;
автоматического поиска другой цели нет. Для возврата на B используйте CD.

Обновляются только закрытые completed frontend issues с текущим закрывающим PR,
входящим в отчёт и смерженным в default branch frontend. Префикс названия не нужен.
Открытые, переоткрытые, ручные/not planned и чужие задачи пропускаются; ручное
закрытие и backend сохраняют прежнее поведение общего обработчика. Встроенный
Item closed должен оставаться выключенным.

Ошибка получения состава сохраняет неполный отчёт: операция может завершиться
успешно, но шаг карточек станет красным без записей статусов. Ошибки отдельных
карточек собираются в Summary, остальные карточки обрабатываются. Ошибка Project
API не меняет успешный Deployment, не запускает откат и не задерживает Telegram.
Retention после успешных Health check и Production result выполняется и при ошибке
карточек; ошибка course-sync не мешает завершению Publish release.

При ошибке проверьте ADD_TO_PROJECT_PAT, Scrumban №1, поле Status и опции
Ready for release, Done, Rollback from production. Отсутствующие карточки и опции
автоматически не создаются. Совпадающий Status со старым timestamp очищается и
выставляется заново с проверкой текущего цикла; сбой между clear/set может оставить
пустой Status. Исправляйте карточки вручную по Summary успешной операции.
Повтор той же выкатки с пустой разницей не ремонтирует карточки; повтор CI для уже
опубликованного SHA тоже не ремонтирует их. Failed issues.closed можно повторить
адресно: устаревший цикл пропускается, актуальный поздний close сохраняет статусы
публикации, выкатки и отката текущего цикла.

Исторические чтения `publicationBase`, `confirmed`, `target` и `retention` сохраняются
для существующего выбора базы, артефактов, цели отката и очистки. Карточки больше
не реконструируются по всем выпускам, PR или всей истории production.

### Доставка и восстановление уведомлений

Журнал новых сообщений хранится в SQLite webhook-сервиса. Старые Deployments
`release-automation` сохраняются как история, новые больше не создаются и шаги
карточек их не обрабатывают. Граница включения нового sender сохраняется отдельной
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

Новые записи `release-artifacts` не создаются; старые остаются историей и источником импорта.
GHCR credentials для выкатки не нужны. Настройки Telegram release-потребителя хранятся в конфигурации
webhook-сервиса; CI/CD их для этой рассылки не используют.

> [!WARNING]
> Ключ S3 действует на весь проект Selectel, а не только на бакет релизов: ограничение
> environment веткой `main` снимать нельзя

### Отчёт операции для webhook-потребителя

`bun run release report <publish|deploy|rollback> <sha>` записывает состав конкретного
диапазона в Summary без Telegram. CI/CD передают outputs `report_base_sha` и
`report_url` в публикацию Release и запись production; `release.json` и payload содержат `notification.base_sha`,
`notification.report_url` и положительный `notification.run_attempt`. Неизвестная
база или ошибка обогащения даёт неполный отчёт без ссылки «полный список» и не
мешает публикации или выкатке. Production record создаётся непосредственно перед
переключением BFF, после подготовки SSH и инструментов.
