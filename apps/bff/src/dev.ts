// Локальный запуск — `bun run dev` из корня (turbo watch запускает и клиент): BFF за Vite на
// https://localhost:5173. Go — только явный GO_API_URL (корневой .env или окружение); примеры
// контракта без Go — `bun run dev:prism`. Переменные из корневого .env важнее этих.
if (!process.env.GO_API_URL) {
    console.error(
        'GO_API_URL не задан: укажите адрес Go с префиксом API в корневом .env, например ' +
            'GO_API_URL=http://127.0.0.1:8080/api/v1 (и BFF_KEY, если Go проверяет X-BFF-Key), ' +
            'или запустите bun run dev:prism — вместо Go будет Prism по копии контракта.',
    );
    process.exit(1);
}
process.env.HTML_TEMPLATE ??= '../client/index.html';
// манифест появляется только при сборке клиента
process.env.SKIP_PUBLIC_FILES ??= '1';
process.env.APP_ORIGIN ??= 'https://localhost:5173';
// постоянный ключ только для dev: сессия переживает перезапуск BFF; на проде SESSION_KEY — из Vault
process.env.SESSION_KEY ??= 'Y2VsbGVzdGlhbC1sb2NhbC1kZXYtc2Vzc2lvbi1rZXk=';

await import('./index.ts');
