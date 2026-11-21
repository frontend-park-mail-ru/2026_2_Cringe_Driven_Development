# AGENTS.md

Фронтенд проекта «Colab» (Cellestial) команды «Cringe Driven Development».
Монорепа на bun workspaces и Turborepo: клиент — `apps/client`, BFF — `apps/bff`,
типы и zod-схемы Go — `packages/schemas`, HTTP-клиент — `packages/http-client` ([локальная разработка](docs/local-development.md#монорепа)). Команды — из корня.
Процесс работы с задачами, ветками, коммитами и PR — в [локальной разработке](docs/local-development.md#как-работать-с-задачами) и [CONTRIBUTING организации](https://github.com/Cringe-Driven-Development-Team/.github/blob/main/CONTRIBUTING.md).
Код/PR/issues — в Cringe-Driven-Development-Team/frontend: ветка web-N,
в PR `Closes #N` создаёт штатную связь с задачей; merge оставляет её открытой
с `Ready for build`, проверенный Release даёт `Ready for release`. Только CD после
Health check и сохранённого production success закрывает completed и ставит `Done`.
Rollback меняет Status на `Rollback from production` без reopen; следующий CD возвращает
`Done`. Ручные reopen после merge и not planned/duplicate защищены; ручное completed
сохраняет Done и допускает rollback после первого подтверждённого CD. Сбой карточек
восстанавливается по исходному Deployment ID через
[Reconcile release issues](docs/release.md#статусы-задач-и-восстановление).
Обязательное ревью ментора. Учебный frontend-park-mail-ru
получает копию main, новые PR туда не создаются.

Общепроектный контекст, действующая архитектура и планы развития проекта — в
[Контекст проекта](https://docs.cellestial.ru/project-context).
Спеки и планы реализации конкретной задачи храни только локально в `docs/superpowers/`
репозитория, где выполняется работа. Не коммить их и не включай в PR; не обходи
`.gitignore` через `git add -f`, даже если скилл или старый план требуют коммита.
Исключение — прямое указание пользователя для конкретных файлов.
Общие для нескольких компонентов решения отражай в `docs`.
При внесении изменений проверяй реализацию по актуальному коду.

## Где искать контекст

Начни с [README](README.md). Запуск и устройство монорепы описаны в
[руководстве по локальной разработке](docs/local-development.md), взаимодействие с Go — в
[контракте API](docs/api-contract.md), CI и выкатка — в [руководстве по релизам](docs/release.md).
Реализацию проверяй в исходниках [клиента](apps/client) и [BFF](apps/bff).

Для межрепозиторных вопросов используй карту владения в контексте проекта. Код Go ищи
в `backend`, инфраструктуру — в `infra`, пакеты `@cdd-team/*` — в `frontend-packages`.
Состояние прода проверяй на стенде или по актуальным свидетельствам.

## Учебный проект: совместимость и прод

У проекта нет живых пользователей; преподаватели проверяют прод примерно раз в месяц.
Между проверками допустимы временная недоступность и несовместимость фронта и бэка
после выкладки одной стороны. Не добавляй по своей инициативе в задачи, планы,
приёмку или код поддержку старого API/клиента, legacy-режимы, поэтапное
переключение, безостановочный деплой и требования высокого uptime. Делай это
только по прямому требованию владельца для конкретной задачи.

Если фронт и бэк можно реализовать и проверить локально по согласованному
целевому контракту, работай над ними независимо. Временная поломка прода
между выкладками не создаёт связи `Blocked by`; проверь интеграцию после обеих
задач. К преподавательской проверке прод должен работать.

## Code Review Rules

- Пиши заголовки и пояснения замечаний к PR на русском языке.
  Имена файлов, идентификаторы, команды и метки приоритета сохраняй без перевода.

## Правила работы

- Работать этапами: сделать этап → человек проверяет → следующий этап только после его команды.
- Если что-то непонятно или есть выбор — спросить, а не угадывать.
- Готовые библиотеки из интернета не подключать. Можно только командные пакеты:
  `@cdd-team/react`, `@cdd-team/zustand`, `@cdd-team/clsx`, `@cdd-team/router`, `@cdd-team/openapi`,
  `@cdd-team/vite-plugin-bff-html`, `@cdd-team/hono` (локальный `packages/hono`, frontend#255). Исключения — по задачам ментора:
  zod (frontend#45), lefthook (frontend#24).
- Не добавлять ничего, что не нужно для задачи. Комментарии в коде — коротко и только там,
  где без них непонятно.
- Каждому экспорту — JSDoc: без него падает `bun run lint`. Типы в `@param` и `@returns` не
  писать — их несёт TypeScript ([локальные правила](docs/local-development.md#документация-кода)).

## Перед работой с Go API

Прочитай [порядок Spec First](docs/api-contract.md#spec-first).
Источник контракта — `spec/openapi.json` в backend; локальная копия `spec/` закреплена по
Git SHA и может отставать. Правки контракта — только PR в backend, затем после успешного CI main
backend `bun run contract:fetch <sha>` и ручная правка `packages/schemas/src/types.ts` по диффу спеки. Ответы и
состояние проверяй на реальном Go. Собственный dev-сервер или мок, имитирующий Go, для обхода
неготового бэкенда не создавай.

## Источники

- API Go: контракт — `spec/openapi.json` в backend, локальная копия `spec/` по SHA из
  `spec/contract-source.json`. Обновить — `bun run contract:fetch <sha>` по коммиту main backend с
  успешным CI (Redocly проверяет спеку там); копию `spec/` руками не править. Типы Go (`@cdd/schemas/types`) —
  редактируемый TypeScript по спеке, без генератора: правятся по диффу спеки в том же изменении,
  соответствие спеке компилятор не доказывает, риск принят (frontend#253,
  [типы Go](docs/api-contract.md#типы-go-без-генератора)). Вызовы Go — `go()` из
  `apps/bff/src/go/request.ts` на `@cdd-team/http-client`. `zod.ts` больше не перегенерируется
  (frontend#210). Клиент Go не вызывает: только HTTP API BFF. zod — по задаче frontend#45, исключение из правила про внешние библиотеки;
  так же `serialize-javascript` в `apps/bff` — по задаче frontend#2, `vite-plugin-mkcert` — локальный
  HTTPS dev по решению команды в frontend#5, `vite-plugin-svgr` — SVG-иконки как компоненты (devDependency) по задаче frontend#36.
- Бэкенд: https://github.com/Cringe-Driven-Development-Team/backend. Клиент ходит только в BFF;
  BFF — в Go по явному `GO_API_URL` с `/api/v1` (умолчания нет,
  [локальные правила](docs/local-development.md#клиент-через-bff), [реальный Go](docs/api-contract.md#реальный-go)).

## Команды

```bash
bun run dev        # разработка с HMR: клиент (Vite, HTTPS) и BFF: HTML и /api — через BFF; Go — GO_API_URL из .env
bun run preview    # локальная проверка production-сборки, включая SW и PWA: BFF на http://localhost:4173, без HMR
bun run dev:trust-windows  # только WSL: разово доверить CA mkcert в Windows
bun run check      # oxfmt --check, oxlint, tsc во всех пакетах
bun run build      # сборка, клиент — в apps/client/dist/
bun run contract:fetch <sha>  # spec/openapi.json из main backend по полному SHA и запись SHA в манифест
bun run contract:verify  # побайтовая сверка spec/openapi.json с backend по SHA из манифеста
```

Перед тем как сказать «готово» — `bun run check` и `bun run build` должны проходить.

Хук `pre-commit` ([lefthook.yml](lefthook.yml)) ставит `bun install`. Он форматирует через `oxfmt`
содержимое индекса — то, что уходит в коммит (`scripts/hooks/format-staged.ts`); рабочий каталог при
этом не трогается, поэтому неиндексированные правки (`git add -p`) не теряются, даже в тех же строках.
Затем `bun run check` по тому, что уходит в коммит: неиндексированные правки и новые файлы на время
проверки убираются в `.git/check-staged/` и потом возвращаются. Ошибка проверки — коммит не создаётся:
исправить причину и закоммитить снова. Хук `post-commit` приводит рабочий файл к закоммиченному виду,
только если он отличается от коммита одним форматированием; файл с неиндексированными правками остаётся
как есть. `git commit --no-verify` хук обходит — не использовать. Обязательная проверка — `Check` в CI.

## Структура `apps/client/src/`

Импорты из другой папки `src` — через алиасы (`@components/...`, `@stores/...`),
внутри своей папки — через `./`. Алиасы заданы только в `paths` в `apps/client/tsconfig.json`,
vite берёт их оттуда.

- `api/bff.ts` — запросы к BFF `api(method, path, options)` на общем `@cdd-team/http-client` (единственный
  экземпляр, транспорт — `api/transport.ts`), типы маршрутов, `BffError` и учёт сессии.
- `components/` — UI-kit по Components из макета: `Button`, `Input`, `Icon`, `Logo`, `Moon`,
  `Snackbar`, `Toast`, `Space`, `ScrollTop` (кнопка «Наверх» порталом в `body`), `SearchBar` (панель поиска). Каждый компонент — папка с `.tsx` и `.module.css`.
- `main.tsx` регистрирует production service worker `/sw.js`; его логика в `apps/client/sw/sw.ts` со своим tsconfig (lib WebWorker). Офлайн-страница — `public/offline.html`, `public/offline.css` и шрифт `public/onest-variable.woff2`.
- `layouts/RootLayout.tsx` — `<main>` с `<Outlet />`, тост и снекбар. Второй `<main>` на страницах не нужен.
- `router.ts` — экземпляр роутера `@cdd-team/router` (API как у TanStack Router) и регистрация его
  типов через `Register`. Импорт роутера — только из `@cdd-team/router`.
- `pages/` — страницы. `routes/` — маршруты и дерево `routeTree.ts`. `path` маршрута берётся из
  `PAGES` (`@cdd/bff/pages`): по этому списку BFF решает, куда вести прямой запрос страницы,
  поэтому новая страница добавляется сначала в `PAGES`.
  `pages/NotebookPage/`: `Runtime.tsx` — баннер, кнопки выполнения в шапке и колонка запуска/остановки у ячейки;
  `Actions.tsx` — меню `⋯` блокнота, подтверждение завершения окружения и переименование; `status.ts` —
  чистые функции, что показать по состоянию `runtime` и сохранения;
  `Output.tsx` — вывод исполнения: текст — текстовыми узлами, PNG/SVG — через `<img>`, HTML — только в
  `<iframe sandbox="">` через `srcdoc`. iframe наследует CSP страницы: встроенные стили HTML-вывода на проде
  блокируются.
- `stores/` — сторы на `@cdd-team/zustand`: `session`, `toast`, `snackbar`; `preloaded` — блокнот из bootstrap; `notebook` — ячейки и сохранение; `runtime` — окружение, исполнение и единая цепочка опроса `runtime.updates`.
- `modules/notebookDelete/` — удаление блокнота с главной и из редактора: допуск по окружению (`gate.ts`),
  `notebooks.delete` с забыванием черновиков и опроса (`actions.ts`), корзина и общий диалог.
- `styles/tokens.css` — переменные с именами как в макете (`color/bg` → `--color-bg`).
  Глобальные стили — только `styles/global.css` и `styles/tokens.css`.
- `assets/` — SVG (знак логотипа, иконки): Vite встраивает их в бандл. Favicon — `public/favicon.png` (знак на прозрачном фоне), иконка iOS — `public/apple-touch-icon.png`,
  их отдаёт BFF с origin: файлы `public/` в HTML prod-сборки не уходят на CDN (`renderBuiltUrl` в `vite.config.prod.ts`).
  Картинки и шрифты лежат в репозитории
  [static](https://github.com/Cringe-Driven-Development-Team/static) и берутся с
  `https://static.cellestial.ru` (переменная `VITE_STATIC_URL` в `.env`). В `index.html` адрес пишется как
  `%VITE_STATIC_URL%` и подставляется штатно Vite, в CSS — как `url('%VITE_STATIC_URL%/img/…')`, его
  подставляет плагин `static-url` из `apps/client/vite/plugins.ts`. Обе подстановки — при сборке и в dev.

Стили компонентов и страниц — CSS Modules: `import styles from './X.module.css'`,
в JSX `className={styles.peek}`, несколько классов — через `clsx` из `@cdd-team/clsx`.
Имена классов короткие, в camelCase, без БЭМ-префиксов: область видимости даёт модуль.
Компонент не стилизует классы другого — нужный класс передаётся ему пропом `className`.
Связанные правила — нативной вложенностью CSS внутри основного правила: состояния и модификаторы
одного элемента (`&:hover`, `&:disabled`, `&.code`), псевдоэлементы (`&::before`) и дочерние
селекторы (`& > li`). Media queries одного селектора — там же, рядом с его базовыми стилями.
При переносе сохранять специфичность и порядок каскада, особенно приоритет disabled/loading над
обычными состояниями. Лишних родительских селекторов не добавлять, DOM-структуру глубокой
вложенностью не повторять.

## Сессия и авторизация

- Сессия — в HttpOnly-cookie BFF, токены Go клиент не видит; refresh, повторы после 401 и удаление
  cookie делает BFF. В `localStorage` токены не писать, cookie не читать.
- Все вызовы — через `api` из `@api/bff`: один вызов — один HTTP-запрос к маршруту из таблицы BFF
  (`apps/bff/src/router/`), транспорт ставит `X-CSRF: 1` и `credentials: 'same-origin'`. Второй транспорт
  не заводить. Аватар — `{ contentType: 'multipart/form-data', body: { avatar: file } }`. Типы входов и
  ответов — `BffPaths` из `@cdd/bff` через `import type` (`Output<path>`, `JsonInput<path>` в `@api/bff`).
  Новый маршрут — запись `route({...})` в таблице BFF: вход проверяет ручная функция из
  `@cdd/schemas/validate`, тип ответа выводится из обработчика.
- Пользователь — из `<script id="bootstrap">` первого HTML (`src/bootstrap.ts`), до первого
  рендера. Статус сессии сразу `guest` | `authed`, запроса при старте нет. Сломанный bootstrap —
  ошибка запуска, гостем она не прикрывается. Маршруты `_guest` (`/login`, `/register`) и `_auth`
  (остальные) проверяют статус в `beforeLoad` и делают `redirect`. При прямом открытии
  страницы куда вести решает BFF (`302` на `/login` или `/404`, правила — в
  [локальной разработке](docs/local-development.md#bff)); при переходе внутри SPA то же делают
  `beforeLoad`, `notFoundComponent` корня и `NOT_FOUND` блокнота. Блокнот при прямом открытии своего
  приходит в bootstrap (`@stores/preloaded`).
- Ошибки — `BffError` (`isBffError` из `@api/bff` — ответ BFF по протоколу `{ error }`): категория — `code`,
  причина — `appCode`, ошибки полей — `validationErrors`; прочие сбои — `kind` `network`, `abort`,
  `protocol`, `session_changed`. На `message` поведение не завязывать.
  `UNAUTHORIZED` защищённого запроса транспорт сам переводит в гостя и ведёт на `/login`;
  `FORBIDDEN`, `BAD_GATEWAY` и сбой сети сессию не завершают.
- Вход, регистрация, выход, выход со всех устройств и смена пароля — `login()`, `register()`,
  `logout()`, `logoutAll()`, `changePassword()`
  из `@stores/session` через `switchSession`: транспорт не пускает новые защищённые запросы, ждёт ответа уже отправленных и
  только затем вызывает запрос смены — поздний `Set-Cookie` прежней сессии не перепишет новую cookie. Ответ на запрос прежней сессии приходит
  ошибкой `SESSION_CHANGED` и в интерфейс не попадает. Если, пока ждали, запрос получил `UNAUTHORIZED`, а
  смена не удалась, сессия всё равно считается потерянной (`onSessionLost`). Смены сессии идут по
  очереди: вызов во время другой смены начинается после её завершения.
- Выход (`/api/auth/logout`) идёт мимо `session.call`: без refresh и повторов. Действующий access — один
  `POST /auth/logout`; истёкший — Go не вызывается. Cookie удаляется при любом итоге, ответ —
  `{ browserSession: 'ended', serverRevocation }`: `confirmed` (Go 204), `unconfirmed` (access истёк
  или Go 4xx), `unknown` (Go 5xx, сеть, таймаут, неожиданный ответ), `not_requested` (сессии не было).
  При `unconfirmed`/`unknown` клиент показывает снекбар; сбой сети и CSRF-отказ — не выход.
  Гонки выхода с другими вкладками и параллельными HTML/RPC-запросами не защищены — это frontend#142.
