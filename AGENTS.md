# AGENTS.md

Фронтенд проекта «Colab» (Cellestial) команды «Cringe Driven Development».
Монорепа на bun workspaces и Turborepo: клиент — `apps/client`, BFF — `apps/bff`,
zod-схемы — `packages/schemas` ([README](README.md#монорепа)). Команды — из корня.
Процесс работы с задачами, ветками, коммитами и PR — в [README.md](README.md#как-работать-с-задачами) и [CONTRIBUTING организации](https://github.com/Cringe-Driven-Development-Team/.github/blob/main/CONTRIBUTING.md).
Код/PR/issues — в Cringe-Driven-Development-Team/frontend: ветка web-N,
в PR `Closes #N`, обязательное ревью ментора. Учебный frontend-park-mail-ru
получает копию main, новые PR туда не создаются.

Общепроектный контекст, действующая архитектура и планы развития проекта — в
[Контекст проекта](https://docs.cellestial.ru/project-context).
Спеки и планы реализации конкретной задачи храни только локально в `docs/superpowers/`
репозитория, где выполняется работа. Не коммить их и не включай в PR; не обходи
`.gitignore` через `git add -f`, даже если скилл или старый план требуют коммита.
Исключение — прямое указание пользователя для конкретных файлов.
Общие для нескольких компонентов решения отражай в `docs`.
При внесении изменений проверяй реализацию по актуальному коду.

## Wiki и общий поиск

Когда нужен контекст о клиенте или BFF, начни с `openwiki_search`, затем прочитай
нужный раздел через `openwiki_read` с ID wiki из результата. Если ответа достаточно
и нет противоречий, остановись. При обычном чтении опубликованная wiki считается
актуальной; её актуальность обеспечивает процесс обновления и публикации.
Не проверяй свежесть, не сравнивай SHA и не делай `git fetch` или grep по исходникам
ради перепроверки ответа. Конкретный исходник нужен при пробеле, противоречии
или для внесения изменений; явные ошибки инструментов не игнорируй.
Не загружай wiki в начале каждой задачи; для простой правки известного файла поиск не обязателен.
Корень текущего checkout получи через `git rev-parse --show-toplevel` и проверь
`origin`: `Cringe-Driven-Development-Team/frontend`.
Wiki описывает реализацию; состояние прода прямо сейчас требует отдельного свидетельства.
Если wiki ещё не создана, читай README, локальные инструкции и исходники.

Для межрепозиторных вопросов используй общий OpenWiki workspace четырёх соседних
клонов `docs`, `frontend`, `backend`, `infra`: настройка — в README docs.
При нескольких пространствах проверь `openwiki workspace current` и выбери нужное
через `openwiki workspace use`. В MCP ищи через `openwiki_search`, затем передавай
в `openwiki_read` ID wiki из результата: не считай чужой результат локальным.
Карту владения ищи в docs, Go — в backend, инфраструктуру — в infra;
внутренности `@cdd-team/*` — в исходниках frontend-packages по карте docs.

Без MCP читай `openwiki/quickstart.md` и нужную Markdown-страницу клона или GitHub
с тем же правилом остановки при достаточном ответе.
Соседний docs относительно основного checkout (включая worktree):
`git -C "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/../docs" rev-parse --show-toplevel`.
Проверь его `origin`: `Cringe-Driven-Development-Team/docs`; если клона нет,
используй https://github.com/Cringe-Driven-Development-Team/docs/tree/main/openwiki.
Проверки свежести (`bun scripts/openwiki-check.ts --against <SHA>` у владельца)
относятся к обслуживанию, генерации, CI и явной диагностике по запросу пользователя.
Пути определяй заново, не полагайся на память. Состояние прода прямо сейчас проверяй
по свидетельствам или стенду; будущие фичи — в `/modules/` docs.

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
  `@cdd-team/vite-plugin-bff-html`. Исключения — по задачам ментора:
  Orval и zod (frontend#45), lefthook (frontend#24).
- Не добавлять ничего, что не нужно для задачи. Комментарии в коде — коротко и только там,
  где без них непонятно.
- Каждому экспорту — JSDoc: без него падает `bun run lint`. Типы в `@param` и `@returns` не
  писать — их несёт TypeScript ([локальные правила](docs/local-development.md#документация-кода)).

## Перед работой с Go API

Прочитай [порядок Spec First и работы с Cloud Mock](docs/api-contract.md#spec-first-и-cloud-mock).
Проверь актуальный контракт в Apidog и синхронизируй его: локальная спецификация может
отставать. Проверяй интерфейс через BFF → Cloud Mock Apidog, не дожидаясь реализации Go.
Если мок расходится с контрактом или не покрывает нужный сценарий, сначала доработай
его отдельным MR в Apidog; после слияния повтори проверку. Собственный dev-сервер,
имитирующий Go, для обхода неготового бэкенда или дефекта мока не создавай.
Исключение — Prism (`bun run dev:prism`): он не пишется руками, а отвечает примерами
контракта из `spec/openapi.json`; своих моков и логики в нём не заводи
([локальный мок на Prism](docs/api-contract.md#локальный-мок-на-prism)).
Управляемые ответы в автоматических тестах допустимы.

## Источники

- API Go: контракт в Apidog, локальная копия — `spec/openapi.json`. Обновить — `bun run sync`
  (`bun run apidog` + `bun run orval`); спеку и сгенерированное (`apps/bff/src/go/client.ts`,
  `packages/schemas/src/zod.ts`) руками не править. Клиент Go не вызывает: только процедуры BFF. Orval и zod — по задаче frontend#45, исключение из правила про внешние библиотеки;
  так же Hono, `@trpc/server` и `serialize-javascript` в `apps/bff` — по задаче frontend#2,
  `@trpc/client` в `apps/client` — по задаче frontend#5 (с ним `@trpc/server`: `observable` для своего link
  и типы; в бандл идёт только то, что берёт сам `@trpc/client`), `vite-plugin-mkcert` — локальный
  HTTPS dev по решению команды в frontend#5, `vite-plugin-svgr` — SVG-иконки как компоненты (devDependency) по задаче frontend#36, `vite-plugin-pwa` — манифест PWA по задаче frontend#48, с ним `workbox-window` — регистратор service worker `virtual:pwa-register` по задаче frontend#49, `@stoplight/prism-cli` — локальный мок Go по контракту (devDependency) по задаче frontend#37.
- Бэкенд: https://github.com/Cringe-Driven-Development-Team/backend. Клиент ходит только в BFF;
  BFF — в Go по `GO_API_URL` (локально по умолчанию — Cloud Mock Apidog,
  [локальные правила](docs/local-development.md#клиент-через-bff)).

## Команды

```bash
bun run dev        # клиент (Vite, HTTPS) и BFF: HTML и /api/trpc — через BFF
bun run dev:pwa    # production-сборка и BFF на http://localhost:4173: проверка PWA и service worker, без HMR
bun run dev:prism  # как dev, но Go — локальный Prism по spec/openapi.json; mock(процедура, статус) в консоли
bun run dev:trust-windows  # только WSL: разово доверить CA mkcert в Windows
bun run check      # oxfmt --check, oxlint, tsc во всех пакетах
bun run build      # сборка, клиент — в apps/client/dist/
bun run orval      # spec/openapi.json → клиент BFF к Go и zod-схемы (orval.config.ts)
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

- `api/trpc.ts` — клиент BFF `trpc` (единственный экземпляр), типы процедур и учёт сессии в транспорте.
- `components/` — UI-kit по Components из макета: `Button`, `Input`, `Icon`, `Logo`, `Moon`,
  `Snackbar`, `Toast`, `Space`, `ScrollTop` (кнопка «Наверх» порталом в `body`), `SearchBar` (панель поиска). Каждый компонент — папка с `.tsx` и `.module.css`.
- `serviceWorker.ts` — регистрация service worker; его кеш настроен в `vite.config.prod.ts`, офлайн-страница — `public/offline.html`, `public/offline.css` и шрифт `public/onest-variable.woff2`: всё в precache, без CDN.
- `layouts/RootLayout.tsx` — `<main>` с `<Outlet />`, тост и снекбар. Второй `<main>` на страницах не нужен.
- `router.ts` — экземпляр роутера `@cdd-team/router` (API как у TanStack Router) и регистрация его
  типов через `Register`. Импорт роутера — только из `@cdd-team/router`.
- `pages/` — страницы. `routes/` — маршруты и дерево `routeTree.ts`. `path` маршрута берётся из
  `PAGES` (`@cdd/bff/pages`): по этому списку BFF решает, куда вести прямой запрос страницы,
  поэтому новая страница добавляется сначала в `PAGES`.
  `pages/NotebookPage/`: `Runtime.tsx` — баннер, кнопки окружения и колонка запуска у ячейки; `status.ts` —
  чистые функции, что показать по состоянию `runtime` и сохранения (тесты — `test/notebookStatus.test.ts`);
  `Output.tsx` — вывод исполнения: текст — текстовыми узлами, PNG/SVG — через `<img>`, HTML — только в
  `<iframe sandbox="">` через `srcdoc`. iframe наследует CSP страницы: встроенные стили HTML-вывода на проде
  блокируются.
- `stores/` — сторы на `@cdd-team/zustand`: `session`, `toast`, `snackbar`; `preloaded` — блокнот из bootstrap; `notebook` — ячейки и сохранение; `runtime` — окружение, исполнение и единая цепочка опроса `runtime.updates`.
- `styles/tokens.css` — переменные с именами как в макете (`color/bg` → `--color-bg`).
  Глобальные стили — только `styles/global.css` и `styles/tokens.css`.
- `assets/` — SVG (знак логотипа, иконки): Vite встраивает их в бандл. Favicon — `public/apple-touch-icon.png`,
  его отдаёт BFF с origin: файлы `public/` в HTML prod-сборки не уходят на CDN (`renderBuiltUrl` в `vite.config.prod.ts`).
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
- Все вызовы — через один клиент `trpc` из `@api/trpc` (`@trpc/client`, `httpBatchLink` на
  `/api/trpc`): он ставит `X-CSRF: 1` и `credentials: 'same-origin'`. Второй транспорт не заводить.
  Вход-`FormData` (аватар) тот же клиент шлёт через `splitLink` → `httpLink`: multipart без батча.
  Типы входов и ответов — `RouterInputs` / `RouterOutputs` из `@cdd/bff` через `import type`.
- Пользователь — из `<script id="bootstrap">` первого HTML (`src/bootstrap.ts`), до первого
  рендера. Статус сессии сразу `guest` | `authed`, запроса при старте нет. Сломанный bootstrap —
  ошибка запуска, гостем она не прикрывается. Маршруты `_guest` (`/login`, `/register`) и `_auth`
  (остальные) проверяют статус в `beforeLoad` и делают `redirect`. При прямом открытии
  страницы куда вести решает BFF (`302` на `/login` или `/404`, правила — в
  [локальной разработке](docs/local-development.md#bff)); при переходе внутри SPA то же делают
  `beforeLoad`, `notFoundComponent` корня и `NOT_FOUND` блокнота. Блокнот при прямом открытии своего
  приходит в bootstrap (`@stores/preloaded`).
- Ошибки — `TRPCClientError` (`isRpcError` из `@api/trpc`): категория — `data.code`, причина —
  `data.appCode`, ошибки полей — `data.zodError`; на `message` поведение не завязывать.
  `UNAUTHORIZED` защищённой процедуры транспорт сам переводит в гостя и ведёт на `/login`;
  `FORBIDDEN`, `BAD_GATEWAY` и сбой сети сессию не завершают.
- Вход, регистрация, выход, выход со всех устройств и смена пароля — `login()`, `register()`,
  `logout()`, `logoutAll()`, `changePassword()`
  из `@stores/session` через `switchSession`: транспорт не пускает новые защищённые запросы, ждёт ответа уже отправленных и
  только затем вызывает процедуру смены — поздний `Set-Cookie` прежней сессии не перепишет новую cookie. Ответ на запрос прежней сессии приходит
  ошибкой `SESSION_CHANGED` и в интерфейс не попадает. Если, пока ждали, запрос получил `UNAUTHORIZED`, а
  смена не удалась, сессия всё равно считается потерянной (`onSessionLost`). Смены сессии идут по
  очереди: вызов во время другой смены начинается после её завершения. Эти последовательности
  проверяют тесты `apps/client/test/` на настоящем клиенте tRPC с управляемым `fetch`.
- Выход (`auth.logout`) идёт мимо `session.call`: без refresh и повторов. Действующий access — один
  `POST /auth/logout`; истёкший — Go не вызывается. Cookie удаляется при любом итоге, ответ —
  `{ browserSession: 'ended', serverRevocation }`: `confirmed` (Go 204), `unconfirmed` (access истёк
  или Go 4xx), `unknown` (Go 5xx, сеть, таймаут, неожиданный ответ), `not_requested` (сессии не было).
  При `unconfirmed`/`unknown` клиент показывает снекбар; сбой сети и CSRF-отказ — не выход.
  Гонки выхода с другими вкладками и параллельными HTML/RPC-запросами не защищены — это frontend#142.
