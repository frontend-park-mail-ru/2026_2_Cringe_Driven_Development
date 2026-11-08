# CD: последний готовый коммит main — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пустой input ручного CD выбирает последний по истории main опубликованный выпуск; точный тег сохраняет прежний выбор.

**Architecture:** В `Ready release` обновить `origin/main`, не переключая checkout скриптов workflow. В существующем `artifacts` при пустом теге выбрать ближайший к вершине main опубликованный Release по first-parent, затем выполнить общие проверки. Выбор фиксируется один раз; дальнейшие шаги получают прежние outputs и `SHA` через `GITHUB_ENV`.

**Tech Stack:** Bun, TypeScript, Git, GitHub REST API, GitHub Actions; существующие командные инструменты без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-09-cd-default-release-design.md`

## Global Constraints

- Самый новый выпуск определяется историей main, не `published_at`, датой коммита, `Latest` или порядком ответа API.
- Draft и prerelease не участвуют; используются все страницы каталога.
- Ошибка проверки выбранного выпуска останавливает CD, без подбора старого выпуска.
- Явный тег `release-<полный SHA>` сохраняет точный выбор и существующие проверки направления выкладки.
- Не менять Rollback, публикацию, очередь `release-board` и Telegram; прод не выкатывать.
- Каждому новому экспорту нужен JSDoc. По возможности оставить новый helper приватным.
- Основной checkout содержит пользовательскую правку `AGENTS.md`; её не переносить в коммит и не изменять.

## Review Focus

- Старый SHA опубликован позже нового: порядок выдачи и даты не должны менять цель B в цепочке A → B.
- Main продвинулся, пока CD ждал очередь: выбирать по обновлённому main, сохраняя скрипты checkout workflow.
- На вершине main draft/prerelease, рядом Release боковой ветки: выбрать ближайший опубликованный выпуск основной цепочки.
- Самый новый опубликованный Release повреждён: остановиться, не выбирать исправный старый.
- Более 100 Releases или сбой Git/API: не терять страницы и не превращать ошибку в случайный выбор.

---

### Task 1: Необязательный тег и выбор выпуска по истории main

**Files:**

- Modify: `.github/workflows/cd.yml` — форма запуска и обновление main перед выбором.
- Modify: `scripts/release/releases.ts` — выбор, проверка и логирование выпуска.
- Modify: `scripts/release/index.ts` — справка `artifacts [release-<sha>]`; вызов уже передаёт `args[0] ?? ''`.
- Test: `scripts/release/releases.test.ts`, `scripts/release/workflows.test.ts`.
- Modify if needed: `scripts/release/test/fixture.ts` — только данные/HTTP-границы новых сценариев.
- Modify: `docs/release.md` — пустой input, порядок выбора, поведение очереди и ошибок.

**Interfaces:**

- Reuse: `listReleases(): Promise<GitHubRelease[]>`, `verifyRelease(release, sha)`, `readyRelease(sha)`, `tagOf(sha)`, `shaOfTag(tag)`.
- Extend: `artifacts(tag: string, repoDir = process.cwd()): Promise<void>`; существующий одноаргументный вызов остаётся действующим.
- Private helper: `latestRelease(repoDir: string): Promise<GitHubRelease>`; читает зафиксированную `origin/main` через `git rev-list --first-parent refs/remotes/origin/main` и находит первый опубликованный Release. Git запускается массивом аргументов с `cwd`, ошибка завершается `ReleaseError`.
- Preserve outputs: `sha`, `image_ref`, `assets`, `release_id`; `GITHUB_ENV` получает `SHA` только после успешной проверки.

- [x] **1. Подготовить контекст исполнения.** После выбора пользователем способа исполнения подготовить изолированную ветку от актуального main по правилам репозитория. Прочитать применимые инструкции. Перенести эти spec/plan в рабочую ветку; они могут быть локально ignored, поэтому добавить именно эти файлы явно при коммите. Проверенный при планировании main: `46b378d1db5a6cd4f8a32d5fc4213dfaa6999a30`; если исходники изменились, сверить точки интеграции.

- [x] **2. Добавить регрессионный тест выбора.** Использовать существующую Git-fixture `root → a → b`, `origin/main=b`. Опубликовать B первым, A вторым; A поместить первым в ответ API. Присвоить тестовым объектам даты B раньше A, чтобы явно воспроизвести задержавшуюся публикацию. Выполнить:

    ```ts
    await releases.artifacts('', f.dir);
    expect(outputs()).toContain(`sha=${f.b}`);
    expect(outputs()).toContain(`release_id=${releaseB.id}`);
    expect(readFileSync(process.env.GITHUB_ENV!, 'utf8')).toContain(`SHA=${f.b}`);
    ```

- [x] **3. Запустить новый тест до реализации.** `bun test scripts/release/releases.test.ts -t 'пустой тег'` должен упасть на прежнем требовании точного тега.

- [x] **4. Реализовать выбор и сохранить проверку.** Trim входа; непустой тег направить по прежнему `readyRelease`. Для пустого получить весь каталог, исключить draft/prerelease, найти Release по первому совпадающему `tagOf(sha)` в основной цепочке main. Не перехватывать ошибки `verifyRelease` для продолжения поиска. При отсутствии кандидата, неоднозначности выбранного тега или ошибке Git/API дать понятную ошибку. Проверить выбранный объект до outputs. Логировать тег и `html_url` в обоих режимах. Не добавлять зависимость от даты публикации в production-тип/API выбора.

- [x] **5. Дополнить тесты границ.** Через настоящий `artifacts` проверить: явный A при доступном B; whitespace как пустое поле; workflow SHA=A при origin/main=B; draft/prerelease B пропускается в пользу A; `outside` и коммит боковой ветки не выбираются; пустой каталог; отсутствующая ссылка origin/main; ошибка API; повреждённый B при исправном A вызывает reject и не записывает outputs. Для пагинации поместить B на вторую страницу и проверить его выбор и запрос второй страницы. Проверить наличие выбранного тега/ссылки в логе.

- [x] **6. Обновить workflow и справку.** `release.required: false`; описание: «Тег release-<полный SHA>; пусто — последний опубликованный выпуск по истории main». В существующем `Ready release` перед `bun run release artifacts "$RELEASE"` выполнить `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main`. Ошибка fetch должна останавливать шаг. Сохранить `fetch-depth: 0`, checkout кода workflow, общую очередь и существующие outputs. Обновить workflow-тесты: input необязателен, fetch предшествует выбору, явное значение передаётся через env, доступ к VPS идёт после проверки выпуска.

- [x] **7. Обновить документацию.** Описать оба режима, пример A → B с поздней публикацией A, момент фиксации main после ожидания очереди и остановку при ошибке. Уточнить, что выпуск содержит полный снимок кода: пропущенные промежуточные релизы отдельно выкатывать не нужно.

- [x] **8. Проверить итог.** `bun test scripts/release/releases.test.ts scripts/release/workflows.test.ts`, затем `bun run check`, `bun run test`, `bun run build`; все команды должны завершиться с кодом 0. Не запускать CD для проверки формы.

- [x] **9. Коммит и ревью по выбранному способу исполнения.** Проверить diff на отсутствие посторонних файлов, закоммитить feature вместе с документацией, spec и plan обычным коммитом с hooks. Не применять `--no-verify`. Выполнить ревью, предусмотренное выбранным execution skill; исправить подтверждённые замечания. Merge и production deploy не входят в этот план.

## Самопроверка плана

Все требования спецификации покрыты одной задачей. Review Focus покрыт шагами 2, 5 и 6; проверки выбора не требуют реального GitHub, Docker или VPS. Existing callers используют совместимую сигнатуру. Никаких новых настроек инфраструктуры и внешних зависимостей.
