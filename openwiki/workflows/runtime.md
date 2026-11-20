---
type: workflow
title: "Окружение и выполнение ячеек"
description: "Запуск Python, сохранение кода перед исполнением, опрос очереди, прерывание и показ результатов."
tags: [notebooks, runtime, execution, polling, outputs]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-20T16:46:35.226Z
sources:
  - id: openwiki-source-875979c97693ef36e001d906
    resource: repo://apps/bff/src/router/runtime.ts
  - id: openwiki-source-d12a348ca362781d2dea0350
    resource: repo://apps/client/src/pages/NotebookPage/htmlDocument.test.ts
  - id: openwiki-source-793f6551095eb4e7e5995ba1
    resource: repo://apps/client/src/pages/NotebookPage/htmlDocument.ts
  - id: openwiki-source-2a9eeb2f3b2c02239b5fa65b
    resource: repo://apps/client/src/pages/NotebookPage/Output.tsx
  - id: openwiki-source-883e143aaec01f596294afa2
    resource: repo://apps/client/src/stores/notebook/index.ts
  - id: openwiki-source-2a2c21c54ff3c3a68b69e8a8
    resource: repo://apps/client/src/stores/runtime.ts
generated: { by: "codex", at: "2026-11-20T16:46:35.226Z" }
---

# Окружение и выполнение ячеек

## Подготовка и команды

При [загрузке блокнота](../architecture/request-flow.md) стор получает активную сессию пользователя и очередь, если сессия принадлежит этому блокноту. Открытие своей сессии включает наблюдение с начала журнала и сразу показывает очередь из снимка. Уход со страницы останавливает локальное наблюдение, а окружение продолжает работать. [stores/runtime.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L167-L211).

`runtime.start` готовит окружение Python. При неизвестном исходе клиент сохраняет `request_id` для повтора. Если BFF возвращает уже занятую сессию, стор показывает её. При подтверждённой остановке сессии другого блокнота клиент проверяет `runtime.active`, пока слот не освободится или не сменится сессия. [router/runtime.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/runtime.ts#L18-L36), [startRuntime](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L502-L528), [stopOtherRuntime](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L691-L719).

Один запуск или «Выполнить всё» требуют своей сессии в `READY`. Перед отправкой клиент ждёт [сохранения исходников](notebook.md) через `flush`. Сбой, конфликт, превышение лимита или новый ввод в выбранной ячейке отменяют запуск. «Выполнить всё» фиксирует ID, порядок и ожидаемый исходник кодовых ячеек при нажатии, сверяет их после сохранения и отправляет одну пакетную мутацию. Обе команды передают SHA-256 каждого подтверждённого исходника. Неизвестный исход исполнения сохраняет команду для повтора с прежними ID и телом. [canExecute](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L265-L271), [runCell и runAll](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L530-L575), [отправка и повтор](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L577-L665), [flush](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L780-L824), [процедуры](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/runtime.ts#L37-L47).

## Одна цепочка наблюдения

`runtime.updates` параллельно читает сессию, очередь и страницу событий. Затем BFF читает исполнения по объединению ID из запроса и событий. При сбое одного чтения вся процедура завершается ошибкой. Клиент передаёт курсор и порции до 100 ID. Следующая страница или порция читается сразу, обычный интервал — две секунды. После ошибки повторяется тот же шаг с прежним курсором. После завершения сессии опрос дочитывает хвост и ждёт завершения сохранения результатов. [router/runtime.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/runtime.ts#L15-L16), [updates](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/runtime.ts#L64-L105), [интервал](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L41-L47), [poll](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L281-L352).

| Действие | Как меняется наблюдаемое состояние |
| --- | --- |
| Завершить окружение | После принятого `stop` сессия переходит в `STOPPING`, опрос продолжается |
| Остановить всё | Текущее исполнение прерывается, очередь отменяется, окружение остаётся |
| Прервать ячейку | Прерывается текущее исполнение, очередь продолжается. При потерянном ответе повтор блокируется до свежего снимка очереди |

Активность отправляется только при реальном вводе в редакторе, максимум раз в 30 секунд для своей сессии в `READY` или `RECONNECTING`. [router/runtime.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/bff/src/router/runtime.ts#L48-L63), [команды и активность](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L667-L775), [сверка прерывания](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L292-L318).

## Результаты и вывод

Стор применяет только результат последнего отслеживаемого исполнения для ячейки, с подходящим `source_hash` и без конфликта проекции. При асинхронной проверке хеша дополнительно сверяются поколение и ID исполнения. Результат обновляет только поля вывода и счётчика в подтверждённой ячейке. Переход проекции из `pending` в `applied` позволяет показать «Сохранено», когда ожидающих сохранения результатов больше нет. [runtime.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/runtime.ts#L354-L413), [stores/notebook/index.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/stores/notebook/index.ts#L736-L764).

Текст и traceback отображаются текстовыми узлами. PNG и SVG выводятся через `img`, HTML передаётся как `srcdoc` в iframe с пустым `sandbox`, выставленным до `srcdoc`. Базовые стили HTML-вывода идут перед результатом и имеют нулевую специфичность через `:where()`. Порядок и специфичность проверяет тест. [Output.tsx](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/Output.tsx#L90-L124), [рендер](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/Output.tsx#L178-L216), [iframe](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/Output.tsx#L236-L271), [htmlDocument.ts](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/htmlDocument.ts#L1-L41), [тест](https://github.com/Cringe-Driven-Development-Team/frontend/blob/847eba337b76531681ab40f0831c6fe6988aea23/apps/client/src/pages/NotebookPage/htmlDocument.test.ts#L1-L15).
