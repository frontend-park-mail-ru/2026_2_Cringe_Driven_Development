// pre-commit: форматирует то, что уходит в коммит, — содержимое индекса, а не рабочего каталога.
// Неиндексированные правки (git add -p) физически не затрагиваются: lefthook прячет и возвращает
// их без конфликта, даже если форматирование задевает те же строки. Рабочий каталог подтягивает
// post-commit (sync-formatted.ts).
import { format, git, isFormatted } from './format.ts';

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .toString()
    .split('\0')
    .filter((path) => path && isFormatted(path));

let failed = false;
for (const path of staged) {
    /**
     * Из строки `<mode> <sha> <stage>\t<path>`; ссылки (120000) и подмодули (160000) не
     * форматируются.
     */
    const [mode, sha] = git(['ls-files', '--stage', '--', path]).toString().split(/\s/);
    if (!mode || !sha || mode === '120000' || mode === '160000') continue;
    const content = git(['cat-file', 'blob', sha]);
    let formatted: Buffer;
    try {
        formatted = format(path, content);
    } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        failed = true;
        continue;
    }
    if (formatted.equals(content)) continue;
    const newSha = git(['hash-object', '-w', '--stdin'], formatted).toString().trim();
    git(['update-index', '--cacheinfo', `${mode},${newSha},${path}`]);
    console.log(`отформатирован в индексе: ${path}`);
}
process.exit(failed ? 1 : 0);
