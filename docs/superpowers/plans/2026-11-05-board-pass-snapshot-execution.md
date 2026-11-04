# Выполнение плана Board: один снимок на проход

План: [2026-11-05-board-pass-snapshot.md](2026-11-05-board-pass-snapshot.md).
Способ: `superpowers:executing-plans`, выбран пользователем 5 ноября 2026.
Задача: frontend#155. Ветка: `web-155`; база: `95346eb600335b67e79c643bbc3f42690f251b8c`.

## Pre-flight

Task 1 предоставляет `ReleaseSnapshot.production`, `readProductionDeployments()` и
опциональный production аргумент каталога/снимка. Task 2 использует эти интерфейсы;
конфликтов не обнаружено. Исходные release-тесты: 95 pass, 0 fail.

## Task 1

- RED: 13 pass, 3 fail — отсутствующий reader и production в снимке.
- GREEN: `bun test scripts/release/catalog.test.ts scripts/release/github.test.ts scripts/release/deployments.test.ts` — 25 pass, 0 fail.
- Повторное чтение переданных данных, включая пустую историю, отсутствует.
- Проверки пустых environment-записей, частичного payload, HTTP 503, digest,
  недоверенного workflow, пагинации и rollback сохранены.
- Отклонений от плана нет.

## Task 2

- RED: 22 pass, 6 fail; стабильный пустой каталог читался 4 раза, одна
  подходящая карточка — 5, две — 6. Сценарий ошибки entrypoint уже проходил
  до изменения и сохранён как регрессионная проверка.
- GREEN: `bun test scripts/release` — 105 pass, 0 fail.
- После изменения стабильная история production читается 2 раза при 0/1/2
  подходящих карточках; каталог строится один раз.
- Изменение существующего статуса вызывает второй проход: 3 чтения production,
  2 каталога. При постоянных изменениях: 4 чтения production, 3 каталога,
  затем видимая ошибка. Новая выкатка пересчитывает ранее обработанные карточки.
- Финальная ошибка HTTP 503 не скрывается; актуальные проверки issue сохранены.
- `git diff --check`, `bun run check`, `bun run build`, `bun run test` — exit 0.
  Полный test: scripts 164, BFF 53, client 25 pass; 0 fail (BFF/client из Turbo cache).
- Отклонений от плана нет. CD, Telegram и workflow не менялись.

## Итоговое ревью

Независимый reviewer `gpt-6-astra`, контекст без истории диалога, проверил
диапазон `95346eb..b9870ec`: Critical/Important/Minor — нет, можно вливать.
Повторно выполнил 105 release-тестов (0 fail) и `git diff --check`.

Task 1 complete: `a32ceae..a4dc43c`, task-done — 25 pass, 0 fail.
Task 2 complete: `a4dc43c..b9870ec`, task-done — 105 pass, 0 fail.

Final: Ruling: атомарность с CD не добавляется — кратковременная устарелость
внутри прохода согласована в спецификации, изменения после финальной проверки
подхватывает следующий Board — цена: до следующего прохода/запуска карточка
может показывать прежнее состояние.

Final: Ruling: кэш между запусками, очередь workflow, деплой и уведомления
остаются вне изменения — это согласованные границы данной оптимизации — цена:
объём однократного чтения по-прежнему растёт вместе с историей; время в боевых
Actions ещё не измерено.

Deferred minors: нет. Дополнительный fix pass не потребовался.
