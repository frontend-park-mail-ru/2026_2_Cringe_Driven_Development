import { defineConfig } from 'orval';

const input = { target: 'spec/openapi.json' };

/** Обе цели читают копию контракта Go из backend — spec/openapi.json (bun run sync) */
export default defineConfig({
    /** BFF → Go: fetch-клиент по операциям контракта; адрес Go и заголовки — в мутаторе */
    goApi: {
        input,
        output: {
            target: 'apps/bff/src/go/client.ts',
            client: 'fetch',
            override: {
                mutator: { path: 'apps/bff/src/go/fetch.ts', name: 'bearerFetch' },
                /**
                 * По умолчанию типы ответов-компонентов получают суффикс Response и совпадают со
                 * схемами: ответ RuntimeConflict и схема RuntimeConflictResponse
                 */
                components: { responses: { suffix: 'ResponseBody' } },
            },
        },
    },
    /** Zod-схемы операций — пакет @cdd/schemas: вход процедур BFF */
    goZod: {
        input,
        output: {
            target: 'packages/schemas/src/zod.ts',
            client: 'zod',
        },
    },
});
