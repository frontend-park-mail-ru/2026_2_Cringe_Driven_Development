# Локальная разработка фронтенда

Нужны Bun не ниже 1.4.0 и Node.js не ниже 22.19.0: Vite и `vite-plugin-mkcert` работают в Node.
Команды запускаются из корня репозитория. `bun run dev` — клиент и BFF сразу
([«Клиент через BFF»](#клиент-через-bff), там же первый запуск на macOS, Windows и WSL).

```bash
bun install
bun run dev
bun run check
bun run build
```

## Монорепа

Репозиторий — монорепа на bun workspaces и [Turborepo](https://turborepo.com)

| Каталог            | Пакет          | Что внутри                                                                                |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `apps/client`      | `@cdd/client`  | клиент: Vite, `src/`, `index.html`                                                        |
| `apps/bff`         | `@cdd/bff`     | BFF: Hono + tRPC под Bun, сессия в cookie, пользователь в первом HTML — раздел «BFF» ниже |
| `packages/schemas` | `@cdd/schemas` | zod-схемы операций Go, генерирует Orval (`bun run orval`)                                 |

В корне остаются общее: `spec/` с контрактом, `scripts/` (выгрузка из Apidog и выкатка), конфиги
`oxlint` и `oxfmt`, `.env` — его читают и клиент, и скрипты

Все команды запускаются из корня, зависимости ставит один `bun install`

| Команда                                             | Что делает                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `bun run dev`                                       | клиент и BFF на `https://localhost:5173` — «Клиент через BFF»       |
| `bun run dev:pwa`                                   | production-сборка и BFF на `http://localhost:4173` — «Проверка PWA» |
| `bun run dev:trust-windows`                         | только WSL: разово доверить CA mkcert в Windows для Chrome          |
| `bun run build`                                     | сборка всех пакетов, клиент — в `apps/client/dist`                  |
| `bun run check`                                     | `oxfmt --check`, `oxlint` и `tsc` во всех пакетах и в `scripts/`    |
| `bun run lint`, `bun run typecheck`, `bun run test` | по отдельности, тоже во всех пакетах                                |

`build`, `lint`, `typecheck` и `test` идут через `turbo run`: пакет собирается после своих
зависимостей, а повторный запуск без изменений берёт результат из кеша `.turbo/`
(`>>> FULL TURBO` в выводе). Команду в одном пакете —
`bun run --filter @cdd/client <скрипт>`

## BFF

`apps/bff` — сервер перед Go: процедуры tRPC на `/api/trpc`, сессия в зашифрованной cookie
`__Host-Http-session`, CSRF, пользователь в первом HTML (`<script id="bootstrap">`). Устройство — трек
[BFF](https://docs.cellestial.ru/modules/2/tracks/bff), спека и план —
`docs/superpowers/specs/2026-10-21-bff-design.md`, `docs/superpowers/plans/2026-10-21-bff.md`.

| Переменная            | Что это                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SESSION_KEY`         | ключ AES-256-GCM сессии: base64 ровно 32 байт (`openssl rand -base64 32`), обязателен                      |
| `APP_ORIGIN`          | origin приложения без пути (`https://cellestial.ru`) — для CSRF, обязателен                                |
| `GO_API_URL`          | адрес Go с префиксом API (`http://api:8080/api/v1`), обязателен                                            |
| `PORT`                | порт BFF, по умолчанию `3000`                                                                              |
| `BFF_KEY`             | S2S-ключ для Go (`X-BFF-Key`), на двух VPS                                                                 |
| `HTML_TEMPLATE`       | `index.html` сборки клиента, по умолчанию `/app/client/index.html` (путь в образе)                         |
| `SERVE_CLIENT_ASSETS` | `1` — BFF сам отдаёт JS и CSS из `assets/` рядом с шаблоном, задаёт `bun run dev:pwa`; на проде они на CDN |
| `SKIP_PUBLIC_FILES`   | `1` — не отдавать манифест и иконки, задаёт `bun run dev`: без сборки клиента их нет                       |

По прямому запросу страницы BFF решает, можно ли её открыть (`apps/bff/src/html.ts`). Список путей
страниц — `PAGES` в `apps/bff/src/pages.ts` (`@cdd/bff/pages`); из него же берут `path` маршруты
`apps/client/src/routes`, поэтому новая страница добавляется туда.

| Кто                                       | Адрес                                    | Ответ BFF                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| гость (нет сессии или её не восстановить) | `/login`, `/register`                    | приложение, 200                                                                                                                                                        |
| гость                                     | `/`, `/notebooks/:id`, неизвестный адрес | `302` на `/login`, блокнот у Go не запрашивается                                                                                                                       |
| любой                                     | `/404`                                   | приложение со статусом 404, страница «Не найдено»                                                                                                                      |
| вошедший                                  | неизвестный адрес                        | `302` на `/404`                                                                                                                                                        |
| вошедший                                  | `/notebooks/:id`                         | блокнот запрашивается у Go до HTML: свой — 200 и блокнот в bootstrap, отсутствующий, чужой (Go отвечает 404 на оба) и некорректный ID — `302` на `/404`, сбой Go — 503 |

Блокнот из bootstrap клиент показывает без начального `notebooks.get`. При переходах внутри SPA
нового HTML нет, и то же поведение повторяет клиент: гость с защищённого или неизвестного маршрута
уходит на `/login`, вошедший с неизвестного — на `/404`, а `NOT_FOUND` от `notebooks.get` ведёт на
`/404`.

Неверная конфигурация или шаблон без ровно одного `<script id="bootstrap" type="application/json">`
не дают BFF стартовать; в вывод попадают только имена переменных.

Go для локального запуска — Cloud Mock Apidog: ответы ручек и ошибок заданы там mock expectations по
контракту. Адрес — в Apidog, проект → Mock → Cloud Mock: `https://mock.apidog.com/m1/<проект>-<ветка>-default`,
без `/api/v1` — мок отдаёт пути ручек от корня. BFF получает его переменной `GO_API_URL`; адрес
мока main — значение по умолчанию у `bun run dev` (`apps/bff/src/dev.ts`).

Перед задачей проверь актуальный контракт и сценарии мока по
[порядку Spec First и работы с Cloud Mock](api-contract.md#spec-first-и-cloud-mock).
Там же описан отдельный MR в Apidog, если мок расходится с контрактом или не покрывает сценарий.

```sh
bun run build
SESSION_KEY=$(openssl rand -base64 32) APP_ORIGIN=http://localhost:3000 \
  GO_API_URL=<адрес Cloud Mock> HTML_TEMPLATE=apps/client/dist/index.html \
  bun apps/bff/src/index.ts
```

### Проверка PWA

`bun run dev` работает с HMR и без service worker. Для установки, service worker и офлайн-страницы:

```sh
bun run dev:pwa   # http://localhost:4173
```

Команда собирает клиент production-конфигом без `RELEASE_SHA` и `CDN_URL` и запускает BFF: HTML с
bootstrap, `/api/trpc`, `/sw.js`, манифест, `/offline.html` и JS/CSS сборки идут с одного origin. Go —
как в `bun run dev`, Docker не нужен. HMR нет: после изменений клиента запустите команду заново.

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
SESSION_KEY=$(openssl rand -base64 32) GO_API_URL=<адрес Cloud Mock> \
  docker compose -f apps/bff/compose.yml up -d
curl localhost:3000/health
```

Проверка Cloud Mock — `GO_API_URL=<адрес Cloud Mock> bun run mock:check` (`apps/bff/test/mock-check.ts`):
статусы mock expectations и тела ответов по zod-схемам. Сценарии, которым нужно
состояние Go (одновременный refresh, повтор после 401, сбои и таймауты Go), проверяют тесты
`bun run test`: `apps/client/test/` — смена сессии в транспорте клиента на настоящем клиенте tRPC
с управляемым `fetch`; `apps/bff/test/` — весь обработчик BFF против Go с управляемыми ответами
(`test/fake-go.ts`), без сервера и сети.

## Клиент через BFF

`bun run dev` из корня запускает `turbo watch dev`, а он — клиент и BFF на одном origin
`https://localhost:5173`: Vite собирает и обновляет модули (HMR), HTML страниц и `/api/trpc` отдаёт
BFF — с пользователем в `<script id="bootstrap">` и cookie сессии. `.env` не нужен, разовая настройка
сертификата — в «Первом запуске» ниже:

- Vite (`apps/client`) — HTTPS, слушает `127.0.0.1:5173` (с `localhost` на Windows он недоступен);
  открывать `https://localhost:5173` — этот origin BFF ждёт в `APP_ORIGIN`. Сертификат выпускает
  [`vite-plugin-mkcert`](https://github.com/liuweiGL/vite-plugin-mkcert). `/api/trpc` проксируется в
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
  `APP_ORIGIN=https://localhost:5173`, Go — Cloud Mock Apidog
  (`https://mock.apidog.com/m1/1382426-0-default`), постоянный dev-ключ сессии: она переживает
  перезапуск BFF. Любое из этого перекрывается корневым `.env` (`GO_API_URL`, `SESSION_KEY`, …).
  Перезапускает BFF `turbo watch`: при изменении файлов `apps/bff` и пакетов, которые он
  импортирует (`packages/schemas`). `bun --watch` для этого не годится: на Windows он не следит за
  файлами вне `apps/bff`. Vite при этом не перезапускается, клиент обновляет HMR.

Cookie сессии — `Secure` и с префиксом `__Host-`: нужен HTTPS, ради dev атрибуты не ослабляются.
При первом запуске плагин скачивает mkcert в `~/.vite-plugin-mkcert`, создаёт локальный CA и
добавляет его в доверенные системы, где запущен Vite. Дальше сертификат берётся из того же каталога.
Если в `PATH` первым находится другой `mkcert` — например, npm-пакет с тем же именем, — который не
отвечает на `mkcert -CAROOT`, `apps/client/vite.config.dev.ts` убирает его каталог из `PATH` dev-сервера, и плагин
скачивает официальный бинарник.

### Первый запуск

После разовой настройки `bun run dev` поднимает Vite и BFF вместе, без других шагов.

- **macOS.** `bun run dev`, при первом запуске Keychain спросит пароль, чтобы доверять CA.
- **Windows.** `bun run dev`, при первом запуске Windows спросит подтверждение установки CA.
- **WSL + Chrome в Windows.** `bun run dev` ставит CA в доверенные Ubuntu, а Chrome смотрит в
  хранилище Windows. После первого `bun run dev` один раз выполнить `bun run dev:trust-windows`:
  скрипт проверяет публичный `~/.vite-plugin-mkcert/rootCA.pem` в `CurrentUser\Root` Windows и, если
  его там нет, после подтверждения добавляет; Windows тоже покажет окно подтверждения. Повторный
  запуск ничего не меняет. Ключ CA (`rootCA-key.pem`) в Windows не копируется.

Cloud Mock отвечает фиксированно (раздел «BFF» выше): `denis` / `password123` — вход,
`wrong-password` — неверный пароль. Против своего Go — `GO_API_URL=http://127.0.0.1:8080/api/v1`
в `.env`.

Контракт Go обновляется `bun run sync` (`bun run apidog && bun run orval`): клиент контракт Go не
читает, типы процедур берёт из `@cdd/bff`.

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
к имени и типу. Сгенерированные Orval файлы линт не проверяет
