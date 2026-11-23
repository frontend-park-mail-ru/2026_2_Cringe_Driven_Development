/**
 * Значение переменной окружения: пустая — то же, что отсутствующая.
 * @param name имя переменной
 */
const read = (name: string): string | undefined => process.env[name] || undefined;

/**
 * Флаг `1` или его отсутствие.
 * @param name имя переменной
 */
const flag = (name: string): '1' | undefined => (read(name) === '1' ? '1' : undefined);

function parse() {
    const SESSION_KEY = process.env.SESSION_KEY ?? '';
    const APP_ORIGIN = process.env.APP_ORIGIN ?? '';
    const GO_API_URL = process.env.GO_API_URL ?? '';
    const port = read('PORT');
    /** Без отдельной проверки пустой PORT стал бы 0. */
    const PORT = port === undefined ? 3000 : Number(port);
    const isFlag = (name: string): boolean => read(name) === undefined || read(name) === '1';

    const valid: Record<string, boolean> = {
        SESSION_KEY:
            /^[A-Za-z0-9+/]+=*$/.test(SESSION_KEY) &&
            Buffer.from(SESSION_KEY, 'base64').length === 32,
        APP_ORIGIN: URL.canParse(APP_ORIGIN) && new URL(APP_ORIGIN).origin === APP_ORIGIN,
        GO_API_URL: URL.canParse(GO_API_URL),
        PORT: Number.isInteger(PORT) && PORT >= 1 && PORT <= 65535,
        SKIP_PUBLIC_FILES: isFlag('SKIP_PUBLIC_FILES'),
        SERVE_CLIENT_ASSETS: isFlag('SERVE_CLIENT_ASSETS'),
    };
    /** Имена непрошедших переменных — без значений: они могут быть секретами. */
    const names = Object.keys(valid).filter((name) => !valid[name]);
    if (names.length > 0) {
        console.error(`Неверная конфигурация: ${names.join(', ')}`);
        process.exit(1);
    }
    return {
        SESSION_KEY,
        APP_ORIGIN,
        GO_API_URL,
        PORT,
        BFF_KEY: read('BFF_KEY'),
        HTML_TEMPLATE: read('HTML_TEMPLATE') ?? '/app/client/index.html',
        SKIP_PUBLIC_FILES: flag('SKIP_PUBLIC_FILES'),
        SERVE_CLIENT_ASSETS: flag('SERVE_CLIENT_ASSETS'),
        sessionKey: new Uint8Array(Buffer.from(SESSION_KEY, 'base64')),
    };
}

/**
 * Конфигурация BFF из переменных окружения. Проверяется при импорте: неверная конфигурация
 * завершает процесс с кодом 1 и пишет в stderr только имена переменных.
 */
export const env = parse();
