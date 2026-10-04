# CLAUDE.md

Фронтенд проекта «Colab» (Cellestial) команды «Cringe Driven Development».
Процесс работы с задачами, ветками, коммитами и PR — в [README.md](README.md).

## Правила работы

- С git не работать: не делать `add`, `commit`, `push`, `merge`, `reset` и т. п.
  Когда пора коммитить — сказать об этом и дать текст коммита по шаблону `<тип>: <описание>`.
  Если нужны git-команды — дать их текстом, выполняет человек.
- Работать этапами: сделать этап → человек проверяет → следующий этап только после его команды.
- Если что-то непонятно или есть выбор — спросить, а не угадывать.
- Готовые библиотеки из интернета не подключать. Можно только командные пакеты:
  `@maninthecoat/react`, `@maninthecoat/zustand`, `@iredtea/openapi`.
- Не добавлять ничего, что не нужно для задачи. Комментарии в коде — коротко и только там,
  где без них непонятно.

## Источники

- API: контракт в Apidog, локальная копия — `spec/openapi.json`. После обновления спеки —
  `bun run generate`, файл `src/api/schema.ts` руками не править.
- Бэкенд: https://github.com/go-park-mail-ru/2026_2_Cringe_Driven_Development, локально на
  `http://127.0.0.1:8080` (адрес меняется переменной `BACKEND_URL` в `.env`).

## Команды

```bash
bun run dev        # dev-сервер, /api/v1 проксируется на бэкенд
bun run check      # oxfmt --check, oxlint, tsc
bun run build      # сборка в dist/
bun run generate   # spec/openapi.json → src/api/schema.ts
```

Перед тем как сказать «готово» — `bun run check` и `bun run build` должны проходить.

## Структура `src/`

- `api/` — клиент `@iredtea/openapi` (единственный экземпляр) и сгенерированная схема.
- `components/` — UI-kit по Components из макета: `Button`, `Input`, `Icon`, `Logo`, `Moon`,
  `Snackbar`, `Toast`, `Space`. Каждый компонент — папка с `.tsx` и `.css`.
- `layouts/RootLayout.tsx` — `<main>` с `<Outlet />`, тост и снекбар. Второй `<main>` на страницах не нужен.
- `modules/router/` — командный роутер (API как у TanStack Router). Импорт только через
  `modules/router`, не из внутренних файлов.
- `pages/` — страницы. `routes/` — маршруты и дерево `routeTree.ts`.
- `stores/` — сторы на `@maninthecoat/zustand`: `session`, `toast`, `snackbar`.
- `styles/tokens.css` — переменные с именами как в макете (`color/bg` → `--color-bg`).

## Сессия и авторизация

- Access-токен живёт только в памяти (`authMiddleware`), refresh — в HttpOnly-cookie
  с `Path=/api/v1/auth`. В `localStorage` токены не писать.
- Статус сессии: `unknown` → `guest` | `authed`. Маршруты `_guest` (`/login`, `/register`)
  и `_auth` (остальные) проверяют его в `beforeLoad` и делают `redirect`.
