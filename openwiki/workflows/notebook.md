---
type: workflow
title: "Редактирование и сохранение блокнота"
description: "Список блокнотов, очередь мутаций ячеек, разбор неизвестного исхода и конфликта, удаление блокнота."
tags: [notebooks, autosave, conflict, cells]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-68c1b089f7e6c588dc622cc7
    resource: repo://apps/bff/src/go/api.ts
  - id: openwiki-source-baf5aef4dd91a70c72c54dd6
    resource: repo://apps/bff/src/router/cells.ts
  - id: openwiki-source-fab339fa0fa4e9e9352be6f8
    resource: repo://apps/bff/src/router/notebooks.ts
  - id: openwiki-source-d2c8d7acfa3f1ef3f8c901bf
    resource: repo://apps/client/src/modules/notebookDelete/actions.ts
  - id: openwiki-source-0354a40b6d4278c111a01246
    resource: repo://apps/client/src/modules/notebookDelete/gate.ts
  - id: openwiki-source-a2d8798585f3e12b7ffaf023
    resource: repo://apps/client/src/pages/NotebooksPage/list.ts
  - id: openwiki-source-d6cddbf1634ab8a2dceb6e11
    resource: repo://apps/client/src/pages/NotebooksPage/NotebooksPage.tsx
  - id: openwiki-source-883e143aaec01f596294afa2
    resource: repo://apps/client/src/stores/notebook/index.ts
  - id: openwiki-source-3099a2d6250c67da56765b53
    resource: repo://apps/client/src/stores/notebook/snapshot.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Редактирование и сохранение блокнота

## Список и подтверждённый снимок

Главная запрашивает `notebooks.list` страницами по 24 записи. При добавлении следующей страницы клиент пропускает уже отображённые ID, обновляет курсор и общее количество. BFF передаёт Go только `limit` и `cursor`. Страница блокнота инициализирует стор подтверждённым снимком `hash + cells` из [bootstrap или tRPC](../architecture/request-flow.md). [NotebooksPage.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebooksPage/NotebooksPage.tsx#L37-L49), [list.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebooksPage/list.ts#L3-L35), [router/notebooks.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/notebooks.ts#L8-L22), [stores/notebook/index.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L196-L220).

## Очередь изменений

Правки исходника хранятся поверх подтверждённого снимка как черновики по ID ячейки. Ввод вне IME ставит автосохранение через 500 мс. Завершение редактирования может отправить правку сразу. Черновик больше 64 КиБ UTF-8 остаётся в редакторе, пока его не сократят. Ожидающие изменения одного исходника объединяются. [stores/notebook/index.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L13-L18), [правка и постановка в очередь](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L308-L346).

Создание, правка, перемещение и удаление идут по одной очереди. Каждая мутация берёт последний подтверждённый hash, BFF передаёт его в `If-Match`. У существующих ячеек адресация по ID. Подтверждение обновляет снимок и очищает отправленный черновик, если его текст за это время сохранился прежним. Успешная правка кода очищает старый вывод. Поколение стора защищает другой открытый блокнот от запоздалого ответа. [очередь](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L401-L505), [snapshot.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/snapshot.ts#L35-L103), [router/cells.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/cells.ts#L11-L46), [адаптер Go](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/go/api.ts#L217-L266).

При уходе со страницы ожидающие правки сразу отправляются в очередь. Несохранённое можно вернуть при повторном открытии в той же вкладке. Если hash изменился, стор открывает конфликт. При закрытии или перезагрузке вкладки при несохранённых изменениях страница запрашивает предупреждение браузера. [стор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L184-L245), [NotebookPage.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/NotebookPage.tsx#L293-L310).

## Неизвестный исход и конфликт

После сетевой ошибки или ряда серверных ошибок запись могла состояться. Стор читает серверный снимок и сравнивает ID, порядок, виды и исходники ячеек. Если структура соответствует ожидаемому результату операции, операция подтверждается локально. Если она совпадает с исходным снимком, допускается один автоматический повтор ожидающей операции с актуальным hash. При другом снимке открывается конфликт. Ручной повтор также начинает со сверки. [классификация](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L508-L535), [сверка](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L540-L616), [snapshot.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/snapshot.ts#L105-L122).

`notebook_conflict` останавливает очередь и запускает чтение свежего снимка. Выбор серверной версии принимает снимок и очищает черновики. Выбор своего текста сохраняет исходники существующих ячеек поверх свежего hash. Черновики удалённых на сервере ячеек остаются доступными для копирования. Ожидающие структурные операции сбрасываются. [загрузка конфликта](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L618-L643), [выбор версии](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L677-L728).

## Удаление блокнота

Общий сценарий с главной и из редактора читает `runtime.active`. Рабочая сессия этого блокнота требует сначала завершить окружение, а стадия остановки или очистки — дождаться её окончания. Окончательный допуск решает Go. Для открытого блокнота клиент вызывает `flush` перед однократным `notebooks.delete`. Успех или `NOT_FOUND` сбрасывают локальные черновики, опрос и предзагруженные данные удалённого блокнота. `notebook_in_use` возвращает пользователя к проверке окружения. [gate.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/modules/notebookDelete/gate.ts#L1-L24), [actions.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/modules/notebookDelete/actions.ts#L10-L59), [router/notebooks.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/notebooks.ts#L30-L34).

Перед выполнением кода очередь используется через `flush`. Условия запуска и обработка результатов описаны в [окружении и выполнении ячеек](runtime.md). Сетевые сбои в интерфейсе описаны в [PWA и потере соединения](../concepts/offline.md). [flush](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L780-L824).
