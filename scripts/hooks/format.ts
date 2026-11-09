// Общее для хуков: git и oxfmt по содержимому, без записи файлов рабочего каталога.
import { join } from 'node:path';

/** Расширения, которые форматирует oxfmt; остальные файлы хуки не трогают. */
const FORMATTED = /\.(?:[cm]?[jt]sx?|jsonc?|json5|mdx?|css|scss|less|html|vue|ya?ml|toml|graphql)$/;

/** Запускает git и возвращает stdout; ненулевой код — исключение. */
export function git(args: string[], stdin?: Uint8Array): Buffer {
    const res = Bun.spawnSync(['git', ...args], { stdin, stderr: 'inherit' });
    if (!res.success) throw new Error(`git ${args.join(' ')}: код ${res.exitCode}`);
    return res.stdout;
}

const root = git(['rev-parse', '--show-toplevel']).toString().trim();
const oxfmtBin = join(root, 'node_modules', '.bin', 'oxfmt');

/**
 * Файл форматирует oxfmt: по расширению, без учёта `ignorePatterns` — их учитывает сам oxfmt.
 * @param path путь от корня репозитория
 */
export function isFormatted(path: string): boolean {
    return FORMATTED.test(path);
}

/**
 * Форматирует содержимое как файл `path`: конфиг и `ignorePatterns` из `oxfmt.config.ts`
 * применяются по пути, файл не читается и не пишется.
 * @param path путь от корня репозитория
 * @param content содержимое
 * @returns отформатированное содержимое; файл из `ignorePatterns` возвращается как есть
 */
export function format(path: string, content: Uint8Array): Buffer {
    const res = Bun.spawnSync([oxfmtBin, '--stdin-filepath', path], {
        cwd: root,
        stdin: content,
        stderr: 'pipe',
    });
    if (!res.success) throw new Error(`oxfmt ${path}: ${res.stderr.toString().trim()}`);
    return res.stdout;
}
