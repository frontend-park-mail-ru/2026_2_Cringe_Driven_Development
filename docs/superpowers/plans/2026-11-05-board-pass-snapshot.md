# Один снимок на проход Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Убрать двойную начальную сборку каталога и чтение production перед каждой карточкой, сохранив полную сверку доски.

**Architecture:** Снимок содержит те production deployments со статусами, по которым рассчитан состав выкаченных PR. Board обрабатывает весь проход по снимку и сравнивает production один раз в конце. Изменившаяся история передаётся следующему пересчёту без дополнительного чтения этих же данных.

**Tech Stack:** Существующие Bun, TypeScript, bun:test, Git и GitHub REST/GraphQL; без новых зависимостей.

**Spec:** [Согласованная спецификация](../specs/2026-11-05-board-pass-snapshot-design.md).

## Global Constraints

- Один снимок на проход; полный охват публикаций, PR и задач сохраняется.
- Не больше трёх проходов. Изменение production на третьем — явная ошибка.
- Rollback не отменяет факт успешной выкатки задачи.
- Сохраняются проверки источника, Git-графа, публикации, образа, закрывающего PR, переоткрытия и результата записи статуса.
- Отдельные запускаемые workflow, Telegram, очередь Actions и правила закрытия issue не меняются.
- Нет кэша между запусками, нового хранилища и новой политики статусов.
- Во время прохода допускается временный статус по снимку; новый CD обнаруживается финальной проверкой. Изменения после неё обрабатывает следующий workflow.
- Реализация начинается только после выбора пользователем способа выполнения этого плана.
- При реализации соблюдать cdd-tasks и правила веток/PR frontend. Уже существующая ветка документов — `docs/board-pass-snapshot`; не добавлять новую работу в закрытый PR web-152.
- Вести журнал `docs/superpowers/plans/2026-11-05-board-pass-snapshot-execution.md` по выбранному execution-скиллу; не обходить git hooks.

## Review Focus

1. У существующего deployment меняется только статус: сравнение должно увидеть `in_progress → success` — Task 2.
2. Передан пустой список production: это готовые данные, а не повод повторить HTTP-запрос — Task 1.
3. Сбой финального чтения production не должен дать зелёный Board — Task 2.
4. Новая выкатка затрагивает карточку, обработанную первой: следующий проход должен проверить её снова — Task 2.
5. Автоматические environment deployments без контракта BFF остаются исключёнными; частично заполненный контракт и ошибки чтения статусов не маскируются — Task 1.

## Карта файлов

| Файл                                               | Ответственность                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scripts/release/catalog.ts`                       | Чтение production, включение исходных данных в снимок, повторное использование переданных данных  |
| `scripts/release/board.ts`                         | Один снимок на проход, финальное сравнение, предел повторов                                       |
| `scripts/release/catalog.test.ts`, `board.test.ts` | Счётчики HTTP-запросов и сценарии пересчёта                                                       |
| `scripts/release/sync.ts`, `sync.test.ts`          | Проверка единственной начальной сборки и распространения ошибок; интерфейс entrypoint сохраняется |
| `scripts/release/test/fixture.ts`                  | Уже записывает HTTP-запросы; менять только если тестам не хватает существующего перехвата `extra` |
| `docs/release.md`                                  | Описание прохода и повторов                                                                       |

`github.ts` и workflow менять не требуется: `listDeploymentRecords()` и `api()` уже дают нужные данные. Новых модулей не нужно.

### Task 1: Снимок хранит использованную историю production

**Files:** Modify `scripts/release/catalog.ts`; Test `scripts/release/catalog.test.ts`.

**Interfaces:**

- Добавить `production: Deployment<ProductionPayload>[]` в `ReleaseSnapshot`; существующий `ReleaseCatalog = Omit<ReleaseSnapshot, 'issues'>` наследует поле.
- Добавить `readProductionDeployments(): Promise<Deployment<ProductionPayload>[]>` в `catalog.ts`.
- Расширить `readReleaseCatalog(repoDir: string, production?: Deployment<ProductionPayload>[]): Promise<ReleaseCatalog>`.
- Расширить `readReleaseSnapshot(repoDir: string, production?: Deployment<ProductionPayload>[]): Promise<ReleaseSnapshot>`.
- Существующие вызовы с одним аргументом сохраняются; опциональные данные передаются только из уже прочитанной истории в этом же процессе.

- [x] **Step 1: Добавить тесты повторного использования production.** Использовать настоящую fixture и её `requests`, без моков функций каталога. После `f.publish(); f.deploy()` прочитать `readProductionDeployments()`, очистить журнал запросов, передать результат в `readReleaseSnapshot()` и проверить:

    ```ts
    expect(snapshot.production).toEqual(production);
    expect([...snapshot.deployed]).toEqual([1]);
    expect(
        f.requests.some(
            (r) =>
                r.url.pathname.endsWith('/deployments') &&
                r.url.searchParams.get('environment') === 'production',
        ),
    ).toBe(false);
    expect(f.requests.some((r) => r.url.pathname.endsWith('/deployments/20/statuses'))).toBe(false);
    ```

    Отдельно передать `[]`: `snapshot.production` и `snapshot.deployed` пусты, ни список production, ни его статусы не запрошены. Для обычного вызова без аргумента список production и статус fixture deployment 20 запрашиваются ровно по одному разу.

- [x] **Step 2: Запустить `bun test scripts/release/catalog.test.ts`.** Новые тесты должны падать из-за отсутствующего интерфейса/поведения, а не ошибки fixture.

- [x] **Step 3: Вынести существующее чтение production в `readProductionDeployments()`.** Сохранить страницы и порядок `listDeploymentRecords`, пропуск записей, у которых одновременно отсутствуют все три признака `action/run/image_ref`, чтение последнего статуса остальных записей и обработку ошибок. Сам каталог сохраняет все проверки доверия и digest. При аргументе, отличном от `undefined`, использовать переданные данные, включая пустой массив. Вернуть их в поле `production`. Добавить JSDoc новым экспортам.

- [x] **Step 4: Запустить `bun test scripts/release/catalog.test.ts scripts/release/github.test.ts scripts/release/deployments.test.ts`.** Ожидается 0 failures, включая существующие тесты пропуска автоматического environment deployment, частичного payload, HTTP 503, rollback, страниц и недоверенного workflow.

- [x] **Step 5: Проверить diff и закоммитить Task 1.** Коммит `refactor: сохранять production в снимке релизов`; только файлы задачи и запись в журнале. При subagent-driven выполнении завершить review этой задачи до Task 2.

### Task 2: Один проход без повторных чтений истории на карточках

**Files:** Modify `scripts/release/board.ts`, `docs/release.md`; Test `scripts/release/board.test.ts`, `scripts/release/sync.test.ts`. `sync.ts` менять лишь если интеграционный тест выявит необходимость; его текущий вызов уже строит начальный снимок один раз.

**Interfaces:**

- Использовать поле и функции Task 1.
- Сохранить `syncBoard(snapshot: ReleaseSnapshot, repoDir: string): Promise<BoardResult>` и публичный результат `reconcileBoard()`.

- [x] **Step 1: Добавить тесты ограниченного числа запросов и свежести.**
    - Для стабильной fixture с двумя подходящими задачами, включая уже правильный Done, посчитать запросы вместе с созданием начального снимка: список production — 2, статусы deployment 20 — 2, список closed PR — 1. Прогнать также один подходящий issue: число чтений production должно совпасть. Это доказывает отсутствие чтений истории на каждой карточке.
    - При `read` второй задачи изменить существующий deployment с `in_progress` на `success`: в конце обе задачи Done, сборка каталога дважды, список production трижды (начало и две финальные проверки). Для аналогичного добавления нового deployment сохранить существующий сценарий.
    - На каждой финальной проверке менять статус известной записи: каталог строится ровно 3 раза, список production запрашивается 4 раза, `result.errors` содержит `История production менялась три прохода подряд; повторите синхронизацию`. Четвёртого пересчёта нет.
    - Финальное чтение production отвечает HTTP 503: `syncBoard` отклоняет вызов, а `reconcileBoard().errors` непуст. Проверить через существующий HTTP boundary, без реального API.
    - В `sync.test.ts` проверить стабильный ручной запуск с пустым каталогом и доступным Project: `allowed === true`, `errors` пуст, список production — 2, список closed PR — 1. Существующие тесты недоверенного источника и отсутствия Telegram-запросов остаются.

- [x] **Step 2: Запустить `bun test scripts/release/board.test.ts scripts/release/sync.test.ts`.** Счётчики новых тестов должны выявить старые повторные чтения. Существующие проверки не ослаблять ради зелёного результата.

- [x] **Step 3: Изменить цикл в `syncBoard()`.** Удалить начальный `refresh()` и его вызов внутри `processIssue()`. Каждый проход использует `current`; после всех задач вызвать `readProductionDeployments()` и сравнить результат с `current.production` тем же полным сериализованным представлением данных. При совпадении вернуть результат. При отличии и наличии следующего прохода вызвать `readReleaseSnapshot(repoDir, nextProduction)`. На третьем отличии вернуть существующую ошибку без лишней сборки снимка. Проверки состояния issue, повторное чтение перед mutation, обработку ошибок карточек и проверку записи сохранить.

- [x] **Step 4: Запустить `bun test scripts/release`.** Ожидается 0 failures. Сохраняются тесты переоткрытия перед mutation, обработки ранее пройденной карточки после CD, ручных закрытий, rollback, устаревшего подтверждения статуса и ошибок Project API. Если fixture требует изменения, не убирать последовательности, проверяющие реальные гонки.

- [x] **Step 5: Обновить `docs/release.md`.** Описать снимок на проход, финальную проверку, максимум 3 прохода и восстановление повторным Board при ошибке. Не обещать конкретное время Actions и не предлагать повторять CD ради доски.

- [x] **Step 6: Выполнить `git diff --check`, `bun run check`, `bun run build`.** Все команды завершаются с кодом 0; в журнале указать результаты тестов и фактическое число запросов fixture до/после. Проверить diff на отсутствие изменений CD, уведомлений и других правил статусов.

- [ ] **Step 7: Закоммитить Task 2 и выполнить review по выбранному способу исполнения.** Коммит `fix: проверять production один раз в конце прохода Board`. Для inline — итоговый review ветки по executing-plans; для subagent-driven — review Task 2 и затем всей ветки. Замечания закрыть с проверками затронутого поведения.

## Передача результата

Подготовить PR по cdd-tasks с объяснением устранённых запросов и проверенными сценариями. Слияние, запуск боевого Board и дальнейшие действия выполнять в пределах актуального поручения пользователя. Для этой оптимизации не запускать CD и не переотправлять вебхуки.

## Self-review плана

Проверены: соответствие спецификации, согласованность интерфейсов между задачами,
тесты всех пяти Review Focus, повторное использование production после финальной
проверки, предел проходов и сохранение актуальных проверок issue. План не требует
нового хранилища, workflow или зависимости. Способ выполнения: `superpowers:executing-plans`, выбран пользователем.
