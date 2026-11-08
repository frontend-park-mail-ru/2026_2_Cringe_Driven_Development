import { z } from 'zod';

/** Пустая переменная окружения — то же, что отсутствующая. */
const optional = (value: unknown): unknown => (value === '' ? undefined : value);

const schema = z.object({
    SESSION_KEY: z
        .string()
        .refine(
            (value) =>
                Buffer.from(value, 'base64').length === 32 && /^[A-Za-z0-9+/]+=*$/.test(value),
        ),
    /**
     * `canParse`: refine выполняется и после неудачной проверки url, `new URL` бросил бы со
     * значением.
     */
    APP_ORIGIN: z.url().refine((value) => URL.canParse(value) && new URL(value).origin === value),
    GO_API_URL: z.url(),
    /** Без preprocess пустой PORT стал бы 0. */
    PORT: z.preprocess(optional, z.coerce.number().int().min(1).max(65535).default(3000)),
    BFF_KEY: z.preprocess(optional, z.string().optional()),
    HTML_TEMPLATE: z.preprocess(optional, z.string().default('/app/client/index.html')),
    SKIP_PUBLIC_FILES: z.preprocess(optional, z.literal('1').optional()),
    SERVE_CLIENT_ASSETS: z.preprocess(optional, z.literal('1').optional()),
    /**
     * Только `bun run dev:prism`: заголовок `X-Mock-Prefer` клиента становится `Prefer` для
     * Prism.
     */
    MOCK_PREFER: z.preprocess(optional, z.literal('1').optional()),
});

function parse(): z.infer<typeof schema> & { sessionKey: Uint8Array<ArrayBuffer> } {
    const result = schema.safeParse(process.env);
    if (!result.success) {
        /** Имена непрошедших переменных — без значений: они могут быть секретами. */
        const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
        console.error(`Неверная конфигурация: ${names.join(', ')}`);
        process.exit(1);
    }
    return {
        ...result.data,
        sessionKey: new Uint8Array(Buffer.from(result.data.SESSION_KEY, 'base64')),
    };
}

/**
 * Конфигурация BFF из переменных окружения. Проверяется при импорте: неверная конфигурация
 * завершает процесс с кодом 1 и пишет в stderr только имена переменных.
 */
export const env = parse();
