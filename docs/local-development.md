# Локальная разработка фронтенда

Нужны Bun не ниже 1.4.0 и Node.js не ниже 22.19.0: Vite и `@cdd-team/vite-plugin-mkcert` работают в Node.
Команды запускаются из корня репозитория. `bun run dev` — клиент и BFF сразу
([«Клиент через BFF»](#клиент-через-bff), там же первый запуск на macOS, Windows и WSL).

```bash
bun install
bun run dev
bun run check
bun run build
```

## Проверки перед PR

Из корня репозитория выполните:

```bash
bun run check
bun run build
```

`check` проверяет форматирование, линт и типы. CI `Check` дополнительно собирает
Docker-образ BFF. Изменённое поведение проверяйте вручную; проверки не выкатывают проект.

## Как работать с задачами

Задачи команды собраны на общей [доске](https://github.com/orgs/Cringe-Driven-Development-Team/projects/1).
Правила оформления задач и ревью — в
[CONTRIBUTING команды](https://github.com/Cringe-Driven-Development-Team/.github/blob/main/CONTRIBUTING.md).

Формат коммита: `<тип>: <описание>` либо `<тип>(<область>): <описание>`.
Используйте `feat`, `fix`, `refactor`, `style`, `test`, `docs` или `chore`.

Перед коммитом git-хук форматирует то, что уходит в коммит (неиндексированные правки не трогает), и
запускает `bun run check`; при ошибке
коммит не создаётся. Хук ставит `bun install`. Если он не сработал — `bunx lefthook install`.
После коммита `post-commit` переносит форматирование в рабочий файл, только если
в нём нет других неиндексированных правок.

Ветка задачи — `web-N`, в PR `Closes #N` создаёт штатную связь с задачей;
PR требует ревью frontend-ментора. Merge оставляет задачу открытой с `Ready for build`,
проверенный Release ставит `Ready for release`. Только успешный CD после Health check
и записи production success закрывает задачу completed и ставит `Done`. Rollback
меняет Status на `Rollback from production` без переоткрытия; следующий CD возвращает
`Done`. Ручной reopen после merge и закрытие not planned/duplicate защищены;
ручное completed сохраняет Done и допускает rollback после первого подтверждённого CD.
Сбой обновления задач восстанавливается по исходному Deployment ID через
[Reconcile release issues](release.md#статусы-задач-и-восстановление).
Порядок слияния —
[очередь в main](release.md#очередь-слияния-в-main).

## Монорепа

Репозиторий — монорепа на bun workspaces и [Turborepo](https://turborepo.com)

| Каталог                 | Пакет                   | Что внутри                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/client`           | `@cdd/client`           | клиент: Vite, `src/`, `index.html`                                                                                                                                                                                                         |
| `apps/onlineconf-admin` | `@cdd/onlineconf-admin` | админка OnlineConf — отдельная SPA на `/onlineconf/`. Собирается в `apps/client/dist` после клиента как `onlineconf.html` и свои чанки: выходит тем же релизом. В `bun run dev` — свой Vite на `http://127.0.0.1:5174/onlineconf/` без BFF |
| `apps/bff`              | `@cdd/bff`              | BFF: HTTP API на `Bun.serve`, сессия в cookie, пользователь в первом HTML — раздел «BFF» ниже                                                                                                                                              |
| `packages/schemas`      | `@cdd/schemas`          | типы Go и `GoPaths` — `@cdd/schemas/types`; ручные общие проверки входов браузера и BFF — `@cdd/schemas/validate`; тексты правил логина и пароля — `@cdd/schemas/inputs`                                                                   |

В корне остаются общее: `spec/` с контрактом, `scripts/` (копия контракта из backend и выкатка), конфиги
`oxlint` и `oxfmt`, `.env` — его читают и клиент, и скрипты

Все команды запускаются из корня, зависимости ставит один `bun install`

| Команда                             | Что делает                                                          |
| ----------------------------------- | ------------------------------------------------------------------- |
| `bun run dev`                       | клиент и BFF на `https://localhost:5173` — «Клиент через BFF»       |
| `bun run preview`                   | production-сборка и BFF на `http://localhost:4173` — «Проверка PWA» |
| `bun run dev:tunnel`                | `bun run dev` с production Go через SSH-туннель                     |
| `bun run dev:trust-windows`         | только WSL: разово доверить CA mkcert в Windows для Chrome          |
| `bun run build`                     | сборка всех пакетов, клиент — в `apps/client/dist`                  |
| `bun run check`                     | `oxfmt --check`, `oxlint` и `tsc` во всех пакетах и в `scripts/`    |
| `bun run lint`, `bun run typecheck` | по отдельности, тоже во всех пакетах                                |

`build`, `lint` и `typecheck` идут через `turbo run`: пакет собирается после своих
зависимостей, а повторный запуск без изменений берёт результат из кеша `.turbo/`
(`>>> FULL TURBO` в выводе). Команду в одном пакете —
`bun run --filter @cdd/client <скрипт>`

## BFF

`apps/bff` — сервер перед Go: HTTP API на `/api/*` по таблице маршрутов (`src/router/`), сессия в зашифрованной cookie
`__Host-Http-session`, CSRF, пользователь в первом HTML (`<script id="bootstrap">`). Устройство — трек
[BFF](https://docs.cellestial.ru/modules/2/tracks/bff).

| Переменная                               | Что это                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_KEY`                            | ключ AES-256-GCM сессии: base64 ровно 32 байт (`openssl rand -base64 32`), обязателен                                                                    |
| `APP_ORIGIN`                             | origin приложения без пути (`https://cellestial.ru`) — для CSRF, обязателен                                                                              |
| `IDENTITY_API_URL` и `WORKSPACE_API_URL` | адреса Identity и Workspace с префиксом API. В production обязателен HTTPS                                                                               |
| `ONLINECONF_API_URL`                     | адрес OnlineConf — корень сервиса, без `/api/v1`. Обязателен, в production — HTTPS                                                                       |
| `GO_API_TLS_CA_FILE`                     | путь к PEM доверенного CA. На стенде `/run/secrets/go-api/ca.crt`                                                                                        |
| `GO_API_TLS_CERT_FILE`                   | путь к PEM сертификата `cellestial-bff`. На стенде `/run/secrets/go-api/client.crt`                                                                      |
| `GO_API_TLS_KEY_FILE`                    | путь к приватному ключу. На стенде `/run/secrets/go-api/client.key`                                                                                      |
| `PORT`                                   | порт BFF, по умолчанию `3000`                                                                                                                            |
| `BFF_KEY`                                | S2S-ключ для Go (`X-BFF-Key`), на двух VPS                                                                                                               |
| `HTML_TEMPLATE`                          | `index.html` сборки клиента, по умолчанию `/app/client/index.html` (путь в образе). Рядом BFF берёт `onlineconf.html` админки, кроме `SKIP_PUBLIC_FILES` |
| `SERVE_CLIENT_ASSETS`                    | `1` — BFF сам отдаёт JS и CSS из `assets/` рядом с шаблоном, задаёт `bun run preview`; на проде они на CDN                                               |
| `SKIP_PUBLIC_FILES`                      | `1` — не отдавать манифест и иконки, задаёт `bun run dev`: без сборки клиента их нет                                                                     |

По прямому запросу страницы BFF решает, можно ли её открыть (`apps/bff/src/html.ts`). Список путей
страниц — `PAGES` в `apps/bff/src/pages.ts` (`@cdd/bff/pages`); из него же берут `path` маршруты
`apps/client/src/routes`, поэтому новая страница добавляется туда.

| Кто                                       | Адрес                                    | Ответ BFF                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| гость (нет сессии или её не восстановить) | `/login`, `/register`                    | приложение, 200                                                                                                                                                        |
| гость                                     | `/`, `/notebooks/:id`, неизвестный адрес | `302` на `/login`, блокнот у Go не запрашивается                                                                                                                       |
| любой                                     | `/onlineconf`, `/onlineconf/*`           | админка OnlineConf, 200, без проверки сессии: права проверяет её API                                                                                                   |
| любой                                     | `/404`                                   | приложение со статусом 404, страница «Не найдено»                                                                                                                      |
| вошедший                                  | неизвестный адрес                        | `302` на `/404`                                                                                                                                                        |
| вошедший                                  | `/notebooks/:id`                         | блокнот запрашивается у Go до HTML: свой — 200 и блокнот в bootstrap, отсутствующий, чужой (Go отвечает 404 на оба) и некорректный ID — `302` на `/404`, сбой Go — 503 |

Блокнот из bootstrap клиент показывает без начального `notebooks.get`. При переходах внутри SPA
нового HTML нет, и то же поведение повторяет клиент: гость с защищённого или неизвестного маршрута
уходит на `/login`, вошедший с неизвестного — на `/404`, а `NOT_FOUND` от `notebooks.get` ведёт на
`/404`.

Админка при старте вызывает `GET /api/onlineconf/access`. BFF передаёт OnlineConf access-токен из
сессии и `X-BFF-Key`, роль `onlineconf_admin` проверяет OnlineConf по Identity. Ответы: `204` —
администратор, `401` — нет входа (админка предлагает войти), `403` с `appCode: forbidden` — нет роли
(отказ, продуктовая сессия не завершается), сбой OnlineConf — `502`. Ключ задаёт полное имя
(`<scope>.<имя>`). Ключи — `GET /api/onlineconf/keys/list` (`search`, `scope`, `type`) и `/keys/get?name=`,
`POST /api/onlineconf/keys/create`, `/keys/update` (полная замена, `type` выбирает набор полей) и
`/keys/delete`; пользователь для списков флага — `GET /api/onlineconf/users/resolve?id=` или `?login=`. Отказы
OnlineConf (`validation_error`, `not_found`, `key_name_taken`) приходят в `appCode`. Всё — с той же
проверкой. Локально API админки проверяется через `bun run preview`: dev-Vite админки работает без BFF.

В интерфейсе `/onlineconf/keys` администратор ищет ключи по названию и фильтрует их по скоупу и типу.
Отсюда можно создать JSON-конфиг или открыть карточку по адресу `/onlineconf/keys/<имя>`. В карточке
конфига редактируются JSON-значение и описание. У флага доступна карточка с информацией о ключе.
Поиск и фильтры списка хранятся в адресе; уход с несохранённой формы требует подтверждения.

Неверная конфигурация или шаблон без ровно одного `<script id="bootstrap" type="application/json">`
не дают BFF стартовать; в вывод попадают только имена переменных.

Go для BFF выбирается явно, умолчания нет:

- **Состояние на настоящем Go** — `bun run dev` с `IDENTITY_API_URL` и `WORKSPACE_API_URL` (адрес с `/api/v1`) и, если Go
  проверяет `X-BFF-Key`, `BFF_KEY` в корневом `.env`: свой Go в Docker или разрешённый удалённый
  backend команды через SSH-туннель — production Go, со своими предусловиями
  ([реальный Go](api-contract.md#реальный-go), [туннель](#фронт-с-go-команды-через-ssh-туннель)).

Без `IDENTITY_API_URL` и `WORKSPACE_API_URL` `bun run dev` и `bun run preview` завершают BFF с подсказкой до обработки запросов
(`apps/bff/src/dev.ts`). Перед задачей проверь актуальный контракт по
[порядку Spec First](api-contract.md#spec-first).

```sh
bun run build
SESSION_KEY=$(openssl rand -base64 32) APP_ORIGIN=http://localhost:3000 \
  IDENTITY_API_URL=http://127.0.0.1:8081/api/v1 WORKSPACE_API_URL=http://127.0.0.1:8082/api/v1 BFF_KEY=<ключ Go> HTML_TEMPLATE=apps/client/dist/index.html \
  bun apps/bff/src/index.ts
```

### Проверка PWA

`bun run dev` работает с HMR и без service worker. Для установки, service worker и офлайн-страницы:

```sh
bun run dev      # разработка с HMR
bun run preview  # локальная проверка production-сборки, включая SW и PWA: http://localhost:4173
```

Команда собирает клиент production-конфигом без `RELEASE_SHA` и `CDN_URL` и запускает BFF: HTML с
bootstrap, `/api/*`, `/sw.js`, манифест, `/offline.html` и JS/CSS сборки идут с одного origin. Go —
как в `bun run dev`: явный `IDENTITY_API_URL` и `WORKSPACE_API_URL` (и `BFF_KEY`) из корневого `.env`, без него BFF не стартует. HMR нет: после изменений клиента запустите команду заново.

Вход работает: Chrome и Firefox считают `localhost` безопасным и принимают Secure-cookie сессии. Safari
её по HTTP не принимает, проверяйте в Chrome.

Service worker остаётся в браузере и после остановки команды, на `https://localhost:5173` он не влияет:
у другого origin свой. Удалить — DevTools → Application → Service workers → Unregister.

Офлайн-страница: откройте адрес с сетью, дождитесь активного service worker в DevTools → Application,
остановите команду и откройте адрес снова. Панель Network → Offline не отключает запросы самого service
worker: для этого есть флажок Offline в Application → Service workers.

Образ и локальный Compose:

```sh
bun run image        # turbo run build и docker build -t cdd-bff:local
SESSION_KEY=$(openssl rand -base64 32) IDENTITY_API_URL=http://host.docker.internal:8081/api/v1 WORKSPACE_API_URL=http://host.docker.internal:8082/api/v1 \
  BFF_KEY=<ключ Go> docker compose -f apps/bff/compose.yml up -d
curl localhost:3000/health
```

Сценарии, которым нужно состояние Go (одновременный refresh, повтор после 401, сбои и
таймауты Go), проверяют вручную на реальном Go.

## Клиент через BFF

`bun run dev` из корня запускает `turbo watch dev`, а он — клиент и BFF на одном origin
`https://localhost:5173`: Vite собирает и обновляет модули (HMR), HTML страниц и `/api/*` отдаёт
BFF — с пользователем в `<script id="bootstrap">` и cookie сессии. Нужен адрес Go: `IDENTITY_API_URL` и `WORKSPACE_API_URL` (и при
необходимости `BFF_KEY`) в корневом `.env`.
Разовая настройка сертификата — в «Первом запуске» ниже:

- Vite (`apps/client`) — HTTPS, слушает `127.0.0.1:5173` (с `localhost` на Windows он недоступен);
  открывать `https://localhost:5173` — этот origin BFF ждёт в `APP_ORIGIN`. Сертификат выпускает
  [`@cdd-team/vite-plugin-mkcert`](https://github.com/Cringe-Driven-Development-Team/frontend-packages/tree/main/packages/vite-plugin-mkcert). `/api` проксируется в
  BFF; запрос страницы (`Accept: text/html`) плагин
  [`@cdd-team/vite-plugin-bff-html`](https://github.com/Cringe-Driven-Development-Team/frontend-packages/tree/main/packages/vite-plugin-bff-html)
  отдаёт ответом BFF
  с его `Set-Cookie`, добавив клиент HMR (`transformIndexHtml`). Адрес BFF — `BFF_URL`, по умолчанию
  `http://127.0.0.1:3000`.
- Картинки и шрифты — с адреса `VITE_STATIC_URL`, по умолчанию `https://static.cellestial.ru`; свой
  static — `VITE_STATIC_URL=https://…` в корневом `.env` или окружении. Переменная публичная: адрес
  попадает в HTML страниц и может оказаться в клиентском бандле, секреты в неё не класть. Тот же адрес
  берёт `bun run build`.
- BFF (`apps/bff`, `src/dev.ts`) — шаблон `apps/client/index.html`,
  `APP_ORIGIN=https://localhost:5173`, постоянный dev-ключ сессии: она переживает перезапуск BFF. Go —
  только `IDENTITY_API_URL` и `WORKSPACE_API_URL` из корневого `.env` или окружения, умолчания нет. Остальное тоже перекрывается
  корневым `.env` (`SESSION_KEY`, …).
  Перезапускает BFF `turbo watch`: при изменении файлов `apps/bff` и пакетов, которые он
  импортирует (`packages/schemas`). `bun --watch` для этого не годится: на Windows он не следит за
  файлами вне `apps/bff`. Vite при этом не перезапускается, клиент обновляет HMR.

Cookie сессии — `Secure` и с префиксом `__Host-`: нужен HTTPS, ради dev атрибуты не ослабляются.
При первом запуске плагин берёт `mkcert` из `PATH`, который отвечает на `mkcert -CAROOT`, или
скачивает официальный mkcert v1.4.4 в `~/.vite-plugin-mkcert` (с проверкой SHA-256), создаёт там
локальный CA и добавляет его в доверенные системы, где запущен Vite. Дальше сертификат берётся из того же
каталога. Чужой одноимённый `mkcert` (например, npm-пакет) плагин пропускает сам, `PATH` не меняет.

### Первый запуск

После разовой настройки `bun run dev` поднимает Vite и BFF вместе, без других шагов.

- **macOS.** `bun run dev`, при первом запуске Keychain спросит пароль, чтобы доверять CA.
- **Windows.** `bun run dev`, при первом запуске Windows спросит подтверждение установки CA.
- **WSL + Chrome в Windows.** `bun run dev` ставит CA в доверенные Ubuntu, а Chrome смотрит в
  хранилище Windows. После первого `bun run dev` один раз выполнить `bun run dev:trust-windows`:
  скрипт проверяет публичный `~/.vite-plugin-mkcert/rootCA.pem` в `CurrentUser\Root` Windows и, если
  его там нет, после подтверждения добавляет; Windows тоже покажет окно подтверждения. Повторный
  запуск ничего не меняет. Ключ CA (`rootCA-key.pem`) в Windows не копируется.

HTTPS нужен из-за cookie сессии `Secure` с префиксом `__Host-`: по HTTP браузер её не сохранит, вход
не заработает. Откройте `https://localhost:5173` — после первого запуска сертификат доверенный, без
предупреждения браузера. Против своего Go — `IDENTITY_API_URL=http://127.0.0.1:8081/api/v1 WORKSPACE_API_URL=http://127.0.0.1:8082/api/v1` в `.env`.

Контракты Identity и Workspace закреплены по Git SHA backend:
`bun run contract:fetch` (`main` backend) или `bun run contract:fetch <ветка>`, затем ручная правка типов Go по диффу спеки ([контракт API](api-contract.md)). Клиент контракт Go не
читает, типы маршрутов (`BffPaths`) берёт из `@cdd/bff`.

## Фронт с Go команды через SSH-туннель

Локальные клиент и BFF ходят в настоящий Go команды без своего Go в Docker:
`клиент → локальный BFF → 127.0.0.1:18444/18445 → SSH через gateway → Identity и Workspace на VPS2:8444/8445`.
На gateway разрешён forwarding только к Go API и SSH VPS2
([infra#155](https://github.com/Cringe-Driven-Development-Team/infra/issues/155)), Go API в интернет не
опубликован: `https://cellestial.ru/api/v1` вместо туннеля не подходит.

> [!WARNING]
> Это **production Go**: запросы читают и меняют production-данные, окружения запускаются в общем пуле
> runtime VPS. Заведите отдельный тестовый аккаунт и завершайте запущенные окружения.

### Разовая подготовка

1. **SSH-доступ к gateway.** Публичный ключ — отдельным `.pub`-файлом в `ansible/files/authorized_keys/`
   репозитория infra через PR; после мержа владелец infra применяет `site.yml`
   ([ansible/README.md](https://github.com/Cringe-Driven-Development-Team/infra/blob/main/ansible/README.md)).
   Пользователь, адрес gateway и проверка host key — в
   [командном справочнике подключения](https://github.com/Cringe-Driven-Development-Team/agent-plugins-private/blob/main/plugins/cellestial-ops/skills/cellestial-ops/SKILL.md)
   (приватный репозиторий команды).
2. **Приватный адрес VPS2** — в настроенном checkout `infra/pulumi`: `pulumi stack output backendPrivateIp`
   (без `--show-secrets`). Нет доступа к стейту — спросите у владельца infra, по подсети не угадывайте.
3. **Сервисный ключ BFF → Go.** Production Go проверяет `X-BFF-Key`: без ключа или с неверным он отвечает
   `403 s2s_forbidden`. Ключ один для BFF (`BFF_KEY`) и Go (`BFF_API_KEY`) и лежит в infra зашифрованным
   ansible-vault: `vault_bff_api_key` в `ansible/inventory/group_vars/all/vault.yml`. Пароль vault выдаёт
   владелец infra, хранится он в `~/.config/cdd-vault-pass` с правами `600`. Из checkout infra:

    ```sh
    cd ansible
    ansible-vault view --vault-password-file ~/.config/cdd-vault-pass \
      inventory/group_vars/all/vault.yml | grep '^vault_bff_api_key:'
    ```

    Значение — только в локальном `.env` или окружении: не в Git, примерах, скриншотах и отчётах PR.

4. **Сертификат BFF.** В checkout infra запустите `ansible-playbook -i inventory/ci.yml local-mtls.yml`
   из каталога `ansible`. Playbook использует Vault для подписи и создаёт ключ локально.
   Файлы `ca.crt`, `client.crt`, `client.key` в `~/.config/cellestial/mtls/` должны быть доступны
   текущему пользователю с правами `0400`. Используйте абсолютные пути в `.env`.

BFF в production проверяет HTTPS-адрес и читает все три PEM до запуска HTTP-сервера.
На стенде файлы монтирует Ansible, а после обновления файлов автоматика infra перезапускает BFF.
При локальном запуске перезапустите BFF после обновления файлов.

### Запуск одной командой

В корневом `.env` (в Git не попадает) или окружении:

```dotenv
DEV_TUNNEL_SSH_HOST=<алиас gateway из ~/.ssh/config>
DEV_TUNNEL_BACKEND_HOST=<PRIVATE_IP_VPS2>
BFF_KEY=<vault_bff_api_key>
GO_API_TLS_CA_FILE=/absolute/path/to/ca.crt
GO_API_TLS_CERT_FILE=/absolute/path/to/client.crt
GO_API_TLS_KEY_FILE=/absolute/path/to/client.key
```

```sh
bun run dev:tunnel   # туннель, затем bun run dev: https://localhost:5173
```

Команда обращается к **production Go** и использует ваш SSH-доступ к gateway: поднимает туннель и проверяет `/health` всех трёх API и запускает `bun run dev` с `IDENTITY_API_URL`, `WORKSPACE_API_URL` и `ONLINECONF_API_URL` туннеля поверх `.env`. Нет
переменной, занят порт `18444`, `18445` или `18446` или туннель не поднялся — команда завершается с причиной, Vite и BFF не
запускаются. Ctrl+C останавливает dev и туннель, обрыв туннеля — dev. Обычный `bun run dev` туннель не
запускает. Подробности — `scripts/dev/tunnel.ts`.

### Адреса API

Для production задайте `IDENTITY_API_URL=https://identity.internal.cellestial.ru:8444/api/v1`
и `WORKSPACE_API_URL=https://workspace.internal.cellestial.ru:8445/api/v1`, для OnlineConf —
`ONLINECONF_API_URL=https://onlineconf.internal.cellestial.ru:8446` (без `/api/v1`).
Сервисы используют общий комплект `GO_API_TLS_*_FILE`. Туннель пробрасывает
локальные порты 18444, 18445 и 18446 и проверяет DNS SAN каждого сервиса.

`GET /metrics` возвращает число upstream-вызовов и суммарное время до заголовков
ответа с метками `service` и `outcome`. Идентификатор запроса доступен в access-логе.

## Документация кода

Экспортируемый код документируется JSDoc: функции, компоненты, хуки, классы, константы, типы и
интерфейсы. Это проверяет линт — экспорт без комментария `/** … */` не проходит `bun run check`

Типы в тегах не пишутся — их несёт сигнатура TypeScript. В `@param` и `@returns` только описание

```ts
/**
 * Форма слова для числа: 1 блокнот, 2 блокнота, 5 блокнотов.
 * @param count число
 * @param one форма для 1, 21, 31…
 * @returns число и слово через пробел
 */
```

| Правило                 | Что требует                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdd/require-jsdoc`     | JSDoc у каждого экспортируемого объявления и у публичных методов экспортируемого класса. Реэкспорт (`export { a } from './a'`) не считается; у перегрузок комментарий несёт первая сигнатура |
| `cdd/check-param-names` | имена в `@param` совпадают с параметрами функции и идут в том же порядке                                                                                                                     |

Оба правила — командный плагин
[`@cdd-team/oxlint-plugin-jsdoc`](https://github.com/Cringe-Driven-Development-Team/frontend-packages/tree/main/packages/oxlint-plugin-jsdoc):
в `oxlint` правил `require-jsdoc` и `check-param-names` нет. Сами теги линт не требует: `@param` и `@returns` пишутся там, где описание что-то добавляет
к имени и типу.
