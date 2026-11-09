import { registerSW } from 'virtual:pwa-register';

/**
 * Регистрирует service worker: `/sw.js` на origin приложения, scope `/`. Отказ регистрации не мешает
 * работе приложения: без него нет только офлайн-страницы. В `bun run dev` регистрации нет.
 */
export function registerServiceWorker(): void {
    registerSW({
        immediate: true,
        /**
         * Файлов SPA в кеше нет: новая версия не расходится с открытой вкладкой, а без этого
         * обработчика регистратор перезагрузил бы её и пользователь потерял бы ввод
         */
        onNeedReload: () => undefined,
        onRegisterError: console.error,
    });
}
