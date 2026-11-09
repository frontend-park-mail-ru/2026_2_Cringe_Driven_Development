# Работа с OpenWiki

Собственная wiki описывает код frontend на исходном SHA; она не доказывает выкладку на прод.
Вход — [Wiki кода](../openwiki/quickstart.md); инструкции по работе —
[локальная разработка](local-development.md), [контракт API](api-contract.md) и [релизы](release.md).
Для поиска контекста: `openwiki_search` → `openwiki_read` с ID wiki из результата.
При обычном чтении опубликованная wiki считается актуальной: если ответа достаточно
и нет противоречий, остановитесь без проверки свежести, сравнения SHA и перепроверки
по исходникам. Конкретный исходник нужен при пробеле, противоречии или для правки;
явные ошибки инструментов не игнорируйте. Для простой правки известного файла поиск не обязателен.
Актуальность обеспечивает процесс обновления и публикации. Для обслуживания и явной
диагностики: `bun scripts/openwiki-check.ts --against <полный актуальный SHA frontend/main>`.
Владелец вручную обновляет wiki из корня соседнего docs:
`bun run wiki:update-local --repo ../frontend` (после первоначального OpenWiki init).
Путь `--repo` считается от текущего каталога; при другом расположении клонов укажите
абсолютный путь frontend.
Страницы и checkpoint идут отдельным wiki-only PR; модель в CI не запускается.
Настройка общего поиска четырёх соседних клонов через `openwiki link` —
[README docs](https://github.com/Cringe-Driven-Development-Team/docs#readme).
Без MCP читайте quickstart и нужную Markdown-страницу с тем же правилом остановки;
код командных пакетов ищите в `frontend-packages`. Состояние прода прямо сейчас
требует соответствующего свидетельства; wiki не является мониторингом.

Изменения `openwiki/**` в `main` запускают [Publish docs wiki](../.github/workflows/publish-docs-wiki.yml):
он вызывает `pages.yml` в `docs/main`; для диагностики доступен ручной запуск.
Нужен secret `DOCS_PAGES_TOKEN` с Actions: write только для репозитория docs;
настройка и публичная wiki — в [README docs](https://github.com/Cringe-Driven-Development-Team/docs#readme).
Локальная проверка dispatch без GitHub: `bun test scripts/openwiki-publish.test.ts`.
