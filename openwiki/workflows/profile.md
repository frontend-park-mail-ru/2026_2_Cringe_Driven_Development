---
type: workflow
title: Профиль, логин и пароль
description: Загрузка профиля через users.me, сохранение логина, проверка паролей и завершение сессии после успешной смены через BFF.
tags: [profile, user, forms, validation, session]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-02T21:50:56.050Z
sources:
  - id: openwiki-source-68c1b089f7e6c588dc622cc7
    resource: repo://apps/bff/src/go/api.ts
  - id: openwiki-source-e13a38cf859a665445e386cf
    resource: repo://apps/bff/src/router/users.ts
  - id: openwiki-source-7cd80694ee035fce8b8e9b73
    resource: repo://apps/bff/test/bff.test.ts
  - id: openwiki-source-0a34dba79f18a8aea2708eef
    resource: repo://apps/client/src/pages/ProfilePage/LoginForm.tsx
  - id: openwiki-source-ab719d0c733d6e9b9ef8ae48
    resource: repo://apps/client/src/pages/ProfilePage/PasswordForm.tsx
  - id: openwiki-source-457208b472a11630225995e7
    resource: repo://apps/client/src/pages/ProfilePage/ProfilePage.tsx
  - id: openwiki-source-be36e5b0809ebf7c11fb78ba
    resource: repo://apps/client/src/routes/profile.ts
  - id: openwiki-source-5788d128267fc182c2c8cd90
    resource: repo://apps/client/src/stores/session.ts
  - id: openwiki-source-bd8e04b27b41581dd17106a4
    resource: repo://apps/client/src/utils/credentials.ts
  - id: openwiki-source-6ad8af232827e763157fb593
    resource: repo://apps/client/test/session.test.ts
generated: { by: "codex", at: "2026-11-02T21:50:56.050Z" }
---

# Профиль, логин и пароль

Страница описывает frontend на SHA `d6bdf92f45c039c28dd82c69b1402485b995c222`. Поведение Go рассматривается только на границе вызовов и проверок BFF, без вывода о сохранении данных или отзыве сессий на стенде.

## Открытие и загрузка

`/profile` входит в `_auth`, путь берётся из `PAGES.profile`. Меню профиля ведёт на этот маршрут. Первоначальный пользователь известен из bootstrap, но сама `ProfilePage` дополнительно запрашивает `users.me`: показывает скелетон, затем формы либо состояние ошибки с повтором. Полученного пользователя записывает в общий стор сессии, откуда логин получают страница и шапка. Завершившийся после размонтирования запрос не меняет состояние страницы. [Маршрут](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/routes/profile.ts#L1-L11), [меню](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/components/ProfileMenu/ProfileMenu.tsx#L79-L87), [загрузка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/pages/ProfilePage/ProfilePage.tsx#L22-L87).

## Сохранение логина

`LoginForm` хранит черновик отдельно от сохранённого логина. Неизменённое значение не отправляется; submit проверяет логин и фокусирует неверное поле. Правило клиента — 3–32 символа из латинских букв, цифр и `_`. Успешный `users.updateLogin` заменяет пользователя в сторе и показывает тост. `login_taken` помечает поле и сохраняет ввод; другие ошибки показывают снекбар с явным повтором. Во время отправки поле отключено. [Форма](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/pages/ProfilePage/LoginForm.tsx#L29-L81), [клиентская валидация](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/utils/credentials.ts#L3-L32).

На BFF это защищённая mutation с `UpdateCurrentUserBody`. Ручной Go-адаптер использует `session.call`, ждёт 200 и проверяет `UpdateCurrentUserResponse`; браузер не обращается к Go напрямую. [Процедура](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/users.ts#L1-L10), [адаптер](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/go/api.ts#L57-L66).

## Смена пароля

Форма требует текущий пароль, новый и повтор. Клиент проверяет печатный ASCII без пробелов, длину 8–72, отличие нового от текущего и совпадение повтора. Это локальная проверка удобства ввода; сервер отдельно валидирует вход схемой `ChangeCurrentUserPasswordBody`. Первое неверное поле получает фокус, для каждого поля есть переключение видимости. [Правила](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/utils/credentials.ts#L34-L87), [валидация формы](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/pages/ProfilePage/PasswordForm.tsx#L55-L132).

Действие `changePassword` вызывает mutation через `switchSession`: уже отправленные защищённые запросы завершаются раньше, новые ждут окончания смены в смысле запрета запуска и получают `SESSION_CHANGED`. BFF ожидает успешный 204 Go и только после него вызывает `session.end`. После успеха клиент записывает гостевое состояние, показывает уведомление и переходит на `/login`. Сам frontend не доказывает отзыв других сессий Go. [Очередь и блокирование](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/api/trpc.ts#L52-L106), [смена в сторе](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/stores/session.ts#L98-L108), [BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/router/users.ts#L11-L19), [ожидаемый статус](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/src/go/api.ts#L67-L69).

| Ошибка | Реакция формы |
| --- | --- |
| `invalid_current_password` | Ошибка и фокус текущего пароля, остальные значения остаются |
| `validation_error` | Ошибка и фокус нового пароля |
| Иной результат, включая потерю ответа | Сообщение проверить, какой пароль действует; автоматического повтора нет |

Решение выбирается по `data.appCode`, а не `message`. [Обработка результата](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/src/pages/ProfilePage/PasswordForm.tsx#L62-L88). `UNAUTHORIZED` самой смены пароля обрабатывается транспортом как потеря сессии; подробный порядок — в [сессии](../concepts/session.md).

## Проверки и границы

BFF-тесты подтверждают отправку обновления логина, `login_taken`, отбрасывание неверного ввода до Go, успешное завершение cookie при смене пароля и сохранение сессии при неверном текущем пароле. Клиентские тесты проверяют очередь, блокирование запросов и 401 смены пароля; отдельные тесты — требования нового пароля. Это управляемые ответы, а не проверка реального Go или браузерного рендера форм. [BFF](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/bff/test/bff.test.ts#L524-L582), [клиентский транспорт](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/session.test.ts#L155-L210), [правила](https://github.com/Cringe-Driven-Development-Team/frontend/blob/d6bdf92f45c039c28dd82c69b1402485b995c222/apps/client/test/credentials.test.ts#L1-L21).

Смежные темы: [HTML и bootstrap](../architecture/request-flow.md), [контракты и ошибки](../integrations/contracts.md), [общая карта](../quickstart.md).
