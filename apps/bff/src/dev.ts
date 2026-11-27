// Локальный запуск BFF за Vite на https://localhost:5173.
process.env.HTML_TEMPLATE ??= '../client/index.html';
// манифест появляется только при сборке клиента
process.env.SKIP_PUBLIC_FILES ??= '1';
process.env.APP_ORIGIN ??= 'https://localhost:5173';
// постоянный ключ только для dev: сессия переживает перезапуск BFF; на проде SESSION_KEY — из Vault
process.env.SESSION_KEY ??= 'Y2VsbGVzdGlhbC1sb2NhbC1kZXYtc2Vzc2lvbi1rZXk=';

await import('./index.ts');
