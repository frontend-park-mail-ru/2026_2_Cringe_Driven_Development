# 2026_2_Cringe_Driven_Development

![Главная страница Cellestial со списком блокнотов](.github/assets/cellestial-home.png)

Frontend проекта «Colab» (Cellestial) команды «Cringe Driven Development».

[![Сервис cellestial.ru](https://img.shields.io/badge/cellestial.ru-7A5AF8?style=for-the-badge&logo=googlechrome&logoColor=white)](https://cellestial.ru)
[![Доска задач](https://img.shields.io/badge/Доска_задач-1F6FEB?style=for-the-badge&logo=github&logoColor=white)](https://github.com/orgs/Cringe-Driven-Development-Team/projects/1)
[![Макеты в Figma](https://img.shields.io/badge/Макеты-F24E1E?style=for-the-badge&logo=figma&logoColor=white)](https://www.figma.com/design/7iaVDGiwzQk2vZIB5ogVlq/Colab)
[![Документация](https://img.shields.io/badge/Документация-5C73E7?style=for-the-badge&logo=vitepress&logoColor=white)](https://docs.cellestial.ru/project-context)
[![Контракт API в Apidog](.github/assets/apidog-badge.svg)](https://vb78fyael1.apidog.io/)
[![Бэкенд](https://img.shields.io/badge/Бэкенд-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://github.com/go-park-mail-ru/2026_2_Cringe_Driven_Development)

## Быстрый старт

Нужны Bun не ниже 1.4.0 и Node.js не ниже 22.19.0. Команды выполняются из корня репозитория:

```bash
bun install
bun run dev
```

`bun run dev` запускает клиент (Vite) и BFF на одном origin `https://localhost:5173`: HTML страниц
и `/api/trpc` отдаёт BFF, Go для него — Cloud Mock Apidog. При первом запуске mkcert один раз
попросит подтвердить доверие локальному сертификату; в WSL с Chrome в Windows после этого нужен
`bun run dev:trust-windows` — [«Первый запуск»](docs/local-development.md#первый-запуск).
Перед PR выполните `bun run check` и `bun run build`.

`bun run dev` работает с HMR и без service worker. Проверить PWA и офлайн-режим локально —
`bun run dev:pwa`: он собирает клиент production-конфигом и запускает BFF на `http://localhost:4173`,
Docker не нужен. HMR там нет, после изменений клиента команду надо запустить заново. Подробнее —
[«Проверка PWA»](docs/local-development.md#проверка-pwa).

Изменения ячеек блокнота Cloud Mock не пропускает (`412` на `If-Match`) — для ручной проверки есть
`bun run dev:prism`: Go заменяет локальный Prism по `spec/openapi.json`, подробнее —
[«Локальный мок на Prism»](docs/api-contract.md#локальный-мок-на-prism).
Подробности — в [локальной разработке](docs/local-development.md).

## Монорепа

| Каталог | Назначение |
| --- | --- |
| `apps/client` | Vite-клиент |
| `apps/bff` | BFF: Hono + tRPC под Bun, сессия, пользователь в первом HTML; образ и Compose — [docs/local-development.md](docs/local-development.md#bff) |
| `packages/schemas` | zod-схемы операций Go (Orval) |

Зависимости и команды объединены Bun workspaces и Turborepo.

## Документация

- [Локальная разработка и правила кода](docs/local-development.md) — команды, структура, JSDoc.
- [Контракт API в Apidog](docs/api-contract.md) — синхронизация спецификации и генерация типов.
- [CI и выкатка](docs/release.md) — релизы, CD, откат и диагностика.
- [Контекст проекта](https://docs.cellestial.ru/project-context) — общая архитектура и планы.
- [AGENTS.md](AGENTS.md) — локальные правила для агента.

## OpenWiki

Собственная wiki описывает код frontend на исходном SHA; она не доказывает выкладку на прод.
После bootstrap вход — `openwiki/quickstart.md`; до него пользуйтесь локальными инструкциями выше.
Для поиска контекста: `openwiki_search` → `openwiki_read` с ID wiki из результата.
При обычном чтении опубликованная wiki считается актуальной: если ответа достаточно
и нет противоречий, остановитесь без проверки свежести, сравнения SHA и перепроверки
по исходникам. Конкретный исходник нужен при пробеле, противоречии или для правки;
явные ошибки инструментов не игнорируйте. Для простой правки известного файла поиск не обязателен.
Актуальность обеспечивает процесс обновления и публикации. Для обслуживания и явной
диагностики: `bun scripts/openwiki-check.ts --against <полный актуальный SHA frontend/main>`.
Владелец вручную обновляет wiki из соседнего docs:
`bun run wiki:update-local --repo ../frontend` (после первоначального OpenWiki init).
Страницы и checkpoint идут отдельным wiki-only PR; модель в CI не запускается.
Настройка общего поиска четырёх соседних клонов через `openwiki link` —
[README docs](https://github.com/Cringe-Driven-Development-Team/docs#readme).
Без MCP читайте quickstart и нужную Markdown-страницу с тем же правилом остановки;
код командных пакетов ищите в `frontend-packages`. Состояние прода прямо сейчас
требует соответствующего свидетельства; wiki не является мониторингом.

Изменения `openwiki/**` в `main` запускают [Publish docs wiki](.github/workflows/publish-docs-wiki.yml):
он вызывает `pages.yml` в `docs/main`; для диагностики доступен ручной запуск.
Нужен secret `DOCS_PAGES_TOKEN` с Actions: write только для репозитория docs;
настройка и публичная wiki — в [README docs](https://github.com/Cringe-Driven-Development-Team/docs#readme).

## Как работать с задачами

Задачи команды собраны на общей [доске](https://github.com/orgs/Cringe-Driven-Development-Team/projects/1).
Правила оформления задач и ревью — в
[CONTRIBUTING команды](https://github.com/Cringe-Driven-Development-Team/.github/blob/main/CONTRIBUTING.md).

Формат коммита: `<тип>: <описание>` либо `<тип>(<область>): <описание>`.
Используйте `feat`, `fix`, `refactor`, `style`, `test`, `docs` или `chore`.

Перед коммитом git-хук форматирует то, что уходит в коммит (неиндексированные правки не трогает), и
запускает `bun run check`; при ошибке
коммит не создаётся. Хук ставит `bun install`, поэтому после `git switch` он уже на месте. Если хук
не сработал — `bunx lefthook install`.

### Очередь слияния в main

Целевой порядок работы после включения GitHub Merge Queue:

`PR Check и одобрение ментора → Merge when ready → merge_group Check → автоматическое слияние → push/main publish и sync → ручной CD`.

После успешного `Check`, одобрения frontend-ментора и разрешения обсуждений нажмите
**Merge when ready**. GitHub проверит кандидата с актуальным `main` и предыдущими PR
в очереди: событие `merge_group` запускает тот же `Check` с проверками и сборкой.
Кандидаты имеют отдельные CI-запуски по ref; новый коммит PR отменяет только его
устаревший PR-запуск.

Если `Check` кандидата упал, изучите причину удаления PR из очереди и лог Actions,
исправьте ошибку и отправьте коммит. При конфликте обновите ветку из `main`, разрешите
конфликт локально и отправьте результат. Дождитесь успешного PR `Check` и необходимого
одобрения, затем снова нажмите **Merge when ready**. Если PR нужно отложить, удалите его
из очереди вручную; вернуть его можно той же кнопкой. Кандидаты следующих PR, зависевшие
от удалённого, GitHub перестроит.

На `merge_group` выполняется только `Check`: загрузка релиза, синхронизация учебной
копии и сообщения о релизе в Telegram запускаются после слияния, только на `push/main`.
Выкатка остаётся ручной через workflow CD — [CI и выкатка](docs/release.md).

Целевые настройки защиты `main` (включаются после слияния поддержки `merge_group`):

- Обязательны PR, один approve frontend-ментора без исключения для `YarikMix`, разрешённые
  обсуждения и успешный `Check` от GitHub Actions; force push и удаление ветки запрещены.
- Merge Queue обязательна, способ слияния — merge commit (`MERGE`); production deployment
  перед слиянием не требуется. Отдельное требование актуальности ветки отключено
  (`strict_required_status_checks_policy: false`): актуальность проверяет очередь.
- Параллельно строятся до двух кандидатов (`max_entries_to_build: 2`), стратегия —
  `ALLGREEN`. За раз сливается один PR (`min_entries_to_merge: 1`, `max_entries_to_merge: 1`),
  ожидание минимальной группы — `min_entries_to_merge_wait_minutes: 5`,
  таймаут проверок — `check_response_timeout_minutes: 60`.

## Команда

Ерофей [Гаранин](https://github.com/ManInTheCoat), Денис [Истратов](https://github.com/iRedTea),
Дарья [Шпакова](https://github.com/GrayMouse9), Валентин [Кунев](https://github.com/MrDuckVC).
Менторы: [Ярослав Михалёв](https://github.com/YarikMix) (frontend),
[Александр Батовкин](https://github.com/blackHATred) (backend),
[Дарья Ченцова](https://t.me/dewon_d) (UX).

Совместная проверка Board и обработчика закрытия issues запускается из checkout
командного `.github`:

```bash
FRONTEND_DIR=/absolute/frontend-checkout bun test tests/board-status-integration.test.ts
```

Тест использует временный Git-граф и поддельный HTTP; проверяет оба обработчика
и согласованность concurrency-групп. Живую очередь Actions проверяют при подключении.
