# 2026_2_Cringe_Driven_Development

Frontend-репозиторий проекта «Colab» команды «Cringe Driven Development»

<picture>
<source media="(max-width: 600px)" srcset=".github/assets/dance.gif 1.2x">
<source srcset=".github/assets/dance.gif 0.75x">
<img src=".github/assets/dance.gif" alt="" align="right">
</picture>

### Ссылки

[![Доска задач](https://img.shields.io/badge/Доска_задач-1F6FEB?style=for-the-badge&logo=github&logoColor=white)](https://github.com/orgs/Cringe-Driven-Development-Team/projects/1)
[![Макеты в Figma](https://img.shields.io/badge/Макеты-F24E1E?style=for-the-badge&logo=figma&logoColor=white)](https://www.figma.com/design/7iaVDGiwzQk2vZIB5ogVlq/Colab)
[![Репозиторий бэкенда](https://img.shields.io/badge/Бэкенд-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://github.com/go-park-mail-ru/2026_2_Cringe_Driven_Development)
[![Организация команды](https://img.shields.io/badge/Организация-24292E?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Cringe-Driven-Development-Team)

### Участники команды

1. [Ерофей Гаранин](https://github.com/ManInTheCoat)
2. [Истратов Денис](https://github.com/iRedTea)
3. [Шпакова Дарья](https://github.com/GrayMouse9)
4. [Кунев Валентин](https://github.com/MrDuckVC)

### Менторы

- [Михалёв Ярослав](https://github.com/YarikMix) — _Frontend_
- [Батовкин Александр](https://github.com/blackHATred) — _Backend_
- [Ченцова Дарья](https://t.me/dewon_d) — _UX_

## Как работать с задачами

Код лежит здесь, а задачи — в
[Cringe-Driven-Development-Team/frontend](https://github.com/Cringe-Driven-Development-Team/frontend)
и на общей [доске](https://github.com/orgs/Cringe-Driven-Development-Team/projects/1) вместе с бэковыми

1. **Завести задачу.** На доске в нужной колонке `+ Add item` → ввести `#` →
   выбрать `frontend` → `Create new issue`

> [!WARNING]
> Текст без `#` создаёт черновик: он живёт только на доске, из него нельзя создать ветку,
> и pull request его не закроет

2. **Взять задачу.** На доске выбрать карточку из `Ready`, поставить себя
   в `Assignees`, перевести в `In progress`

3. **Создать ветку.** Открыть задачу → в правой колонке `Development` →
   **`Create a branch`**. В `Repository destination` выбрать
   `frontend-park-mail-ru/2026_2_Cringe_Driven_Development` (в поиске — `2026_2`),
   имя ветки заменить на `web-<номер задачи>`, например `web-12`.
   Затем `Create branch` и локально:

   ```bash
   git fetch
   git switch web-12
   ```

4. **Закоммитить** по шаблону `<тип>: <описание>`, типы — в таблице ниже.
   Область в скобках после типа указывать необязательно:

   ```
   feat: добавить форму входа
   fix: не сбрасывать фокус при ошибке валидации
   refactor(editor): вынести подсветку синтаксиса в отдельный модуль
   ```

5. **Открыть pull request** в `main`, когда код готов к ревью.
   Заголовок — по шаблону `WEB-<номер задачи>: <название задачи>`, например
   `WEB-12: Форма входа`. В описании — **обязательно** строка

   ```
   Closes Cringe-Driven-Development-Team/frontend#12
   ```

   Короткое `Closes #12` сошлётся на этот репозиторий, и задача не закроется.
   Убедиться, что в правой колонке PR в блоке `Development` указана задача

6. **Получить апрув** от [Ярослава](https://t.me/Yaroslav738)

7. **Влить в `main`** через `Merge pull request`.
   Задача закроется сама, карточка уедет в `Done`

> [!TIP]
> Ветку, созданную руками (`git switch -c web-12 origin/main`), с задачей свяжет
> та же строка `Closes …` — поэтому она обязательна всегда

## Типы коммитов

> [!NOTE]
> Коммиты ветки попадают в `main` как есть, поэтому от их качества зависит
> читаемость истории проекта. Сверху добавляется merge-коммит с названием
> pull request


| Тип | Когда используется |
|---|---|
| `feat` | новая функциональность |
| `fix` | исправление бага |
| `refactor` | код переписан, поведение не изменилось |
| `style` | форматирование и отступы, логика не тронута |
| `test` | тесты |
| `docs` | документация |
| `chore` | конфиги, зависимости, сборка, CI |

## Статусы на доске

| Статус | Что означает |
|---|---|
| `Backlog` | задача заведена, но не запланирована в спринт |
| `Ready` | взята в спринт, можно брать в работу |
| `In progress` | в работе |
| `In review` | открыт pull request, ждёт ревью |
| `Done` | влито в `main` |

Статусы доска двигает сама по событиям в pull request. Руками нужно только взять задачу в работу — остальное происходит автоматически
