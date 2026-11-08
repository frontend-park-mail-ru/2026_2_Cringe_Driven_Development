import svgr from 'vite-plugin-svgr';
import { loadEnv, type UserConfig } from 'vite';
import { releaseMetaPlugin, staticUrlPlugin, vitepwaPlugin } from './plugins.ts';

// .env лежит в корне монорепы: его же читают скрипты apidog и release
const envDir = '../..';

/**
 * Адрес без слеша в конце; без протокола считается https.
 * @param url адрес из переменной окружения
 * @returns нормализованный адрес
 */
export const toUrl = (url: string) =>
    (/^https?:\/\//.test(url) ? url : `https://${url}`).replace(/\/+$/, '');

/**
 * Переменные сборки из корневого `.env` и окружения.
 * @param mode режим Vite
 * @returns переменные окружения
 */
export const loadClientEnv = (mode: string) => loadEnv(mode, envDir, '');

/**
 * Общая часть dev- и prod-конфига: алиасы, адрес static в HTML и CSS, метатег `release`.
 * @param env переменные из {@link loadClientEnv}
 * @param release sha релиза или `dev`
 * @returns часть конфига Vite
 */
export const sharedConfig = (env: Record<string, string>, release: string): UserConfig => {
    // VITE_STATIC_URL — публичный адрес static (картинки и шрифты)
    const staticUrl = toUrl(env.VITE_STATIC_URL || 'https://static.cellestial.ru');
    return {
        envDir,
        // алиасы папок src берутся из paths в tsconfig.json
        resolve: { tsconfigPaths: true },
        // %VITE_STATIC_URL% в index.html подставляет сам Vite и берёт значение и из define: так
        // в HTML попадает адрес по умолчанию и тот же нормализованный адрес, что и в CSS
        define: { 'import.meta.env.VITE_STATIC_URL': JSON.stringify(staticUrl) },
        plugins: [
            staticUrlPlugin(staticUrl),
            releaseMetaPlugin(release),
            vitepwaPlugin(),
            // *.svg?react — компонент (иконки, знак логотипа); обычный импорт .svg остаётся URL (empty-planet)
            svgr({
                svgrOptions: { jsxRuntime: 'automatic' },
                // ?react-модуль не видит tsconfig, jsxImportSource задаём здесь
                oxcOptions: { jsx: { runtime: 'automatic', importSource: '@cdd-team/react' } },
            }),
        ],
    };
};
