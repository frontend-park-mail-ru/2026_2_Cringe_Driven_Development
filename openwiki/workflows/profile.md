---
type: workflow
title: "Профиль и безопасность аккаунта"
description: "Загрузка профиля, обновление логина и аватара, настройка 2FA, смена пароля и выход со всех устройств."
tags: [profile, auth, avatar, two-factor, password]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-eb237af3f199730f9b3e53e3
    resource: repo://apps/bff/src/bff.ts
  - id: openwiki-source-68c1b089f7e6c588dc622cc7
    resource: repo://apps/bff/src/go/api.ts
  - id: openwiki-source-e9d516dc0dab591185bbeeb4
    resource: repo://apps/bff/src/router/auth.ts
  - id: openwiki-source-5213fcbe088ee461f12c32c2
    resource: repo://apps/bff/src/router/twoFactor.ts
  - id: openwiki-source-e13a38cf859a665445e386cf
    resource: repo://apps/bff/src/router/users.ts
  - id: openwiki-source-0a34dba79f18a8aea2708eef
    resource: repo://apps/client/src/pages/ProfilePage/LoginForm.tsx
  - id: openwiki-source-36cd4c69f0151bd53ff0009d
    resource: repo://apps/client/src/pages/ProfilePage/LogoutAllSection.tsx
  - id: openwiki-source-ab719d0c733d6e9b9ef8ae48
    resource: repo://apps/client/src/pages/ProfilePage/PasswordForm.tsx
  - id: openwiki-source-457208b472a11630225995e7
    resource: repo://apps/client/src/pages/ProfilePage/ProfilePage.tsx
  - id: openwiki-source-23dcf2c2162947a571d8ec09
    resource: repo://apps/client/src/pages/ProfilePage/TwoFactorSection.tsx
  - id: openwiki-source-aae14d8ce0fe8cf336785ae7
    resource: repo://apps/client/src/routes/routeTree.ts
  - id: openwiki-source-5788d128267fc182c2c8cd90
    resource: repo://apps/client/src/stores/session.ts
  - id: openwiki-source-dca64d4a3a2fa1604113ec26
    resource: repo://apps/client/src/utils/avatar.ts
  - id: openwiki-source-bd8e04b27b41581dd17106a4
    resource: repo://apps/client/src/utils/credentials.ts
  - id: openwiki-source-f6a63762eea9773d605419bb
    resource: repo://packages/schemas/src/inputs.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Профиль и безопасность аккаунта

## Загрузка профиля

`/profile` входит в `_auth`. При открытии страница запрашивает `users.me`, показывает скелетон, затем формы либо ошибку с повтором. Полученный пользователь записывается в общий стор сессии. Ответ после размонтирования игнорируется. [routeTree.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/routes/routeTree.ts#L9-L14), [ProfilePage.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/ProfilePage.tsx#L20-L51), [состояния экрана](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/ProfilePage.tsx#L78-L94).

## Логин и аватар

Форма хранит черновик логина, пропускает неизменённое значение и проверяет его через `ProfileLogin`. `login_taken` оставляет ввод и помечает поле, прочие сбои допускают явный повтор. После подтверждения форма обновляет только `login` в общем сторе. [LoginForm.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/LoginForm.tsx#L26-L82), [общие схемы](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/packages/schemas/src/inputs.ts#L1-L20).

Браузер принимает JPEG и PNG до 5 МиБ, декодирует изображение и проверяет стороны от 64 до 4096 px. `users.uploadAvatar` получает multipart с единственным полем `avatar`. BFF проверяет наличие файла и размер, затем передаёт файл Go. После ответа клиент обновляет только `avatar_url`, поэтому параллельное изменение логина сохраняется. [avatar.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/utils/avatar.ts#L1-L43), [стор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/session.ts#L157-L182), [router/users.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/users.ts#L6-L26), [go/api.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L175-L186).

## Смена пароля и выход со всех устройств

Форма проверяет текущий пароль, формат нового, его отличие от текущего и совпадение повтора. Для логина и пароля клиент использует общие схемы входов. BFF валидирует входы обновления логина и смены пароля, проверяет ответ на обновление логина и ждёт 204 при смене пароля. После подтверждения смены BFF завершает cookie-сессию, действие `switchSession` переводит стор в гостя, а форма показывает уведомление и ведёт на `/login`. [credentials.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/utils/credentials.ts#L9-L68), [PasswordForm.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/PasswordForm.tsx#L55-L111), [стор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/session.ts#L96-L106), [router/users.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/users.ts#L18-L35), [go/api.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L155-L174).

`invalid_current_password` и ошибка формата текущего пароля возвращают фокус текущему полю. `validation_error` или ошибка формата нового пароля помечают новое поле. При неизвестном результате форма предлагает проверить, какой пароль действует, без автоматического повтора. [PasswordForm.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/PasswordForm.tsx#L74-L95).

Выход со всех устройств требует подтверждения пользователя. Клиент сообщает об успехе после подтверждённого ответа Go и ведёт на вход. При неизвестном исходе интерфейс даёт явно повторить операцию. Если транспорт обнаружил потерю сессии, переход на вход выполняется через общий обработчик. [LogoutAllSection.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/LogoutAllSection.tsx#L15-L58), [стор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/session.ts#L136-L155), [auth.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/auth.ts#L30-L35), [сессия](../concepts/session.md).

## Двухфакторная аутентификация

`twoFactor.setup` возвращает данные настройки для QR и ручного ввода. BFF помечает ответ `Cache-Control: no-store`, клиент держит данные в памяти открытого окна. Подтверждение вызывает `twoFactor.confirm` с шестизначным кодом. После успеха интерфейс обновляет `has_2fa`. При `invalid_totp` поле показывает ошибку, а BFF классифицирует ответ как `BAD_REQUEST` без реактивного refresh. Отключение требует текущего пароля и вызывает `twoFactor.disable`. [TwoFactorSection.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/TwoFactorSection.tsx#L30-L112), [подтверждение](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/TwoFactorSection.tsx#L145-L198), [отключение](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/ProfilePage/TwoFactorSection.tsx#L350-L408), [router/twoFactor.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/twoFactor.ts#L5-L19), [bff.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/bff.ts#L26-L37), [go/api.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L310-L337), [errors.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/errors.ts#L38-L53).

При входе форма показывает шаг ввода кода по ответу BFF и передаёт его как `user_code` вместе с логином и паролем. См. [контракты](../integrations/contracts.md) и [локальные режимы проверки](../operations/development.md). [AuthForm.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/AuthPage/AuthForm.tsx#L112-L151).
