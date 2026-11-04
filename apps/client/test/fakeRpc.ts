// BFF с управляемыми ответами для настоящего клиента tRPC: подменяет fetch, понимает батч.
/** Вызов процедуры, как его отправил клиент. */
export type RpcCall = { path: string; input: unknown };

/** Ответ на одну процедуру: данные или ошибка tRPC. */
export type RpcAnswer =
    | { data: unknown }
    | { error: { code: string; httpStatus: number; appCode?: string } }
    | 'network';

type Handler = (input: unknown, call: RpcCall) => RpcAnswer | Promise<RpcAnswer>;

/** Успешный ответ. */
export const ok = (data: unknown): RpcAnswer => ({ data });

/** Ошибка tRPC с кодом категории и причиной. */
export const rpcError = (code: string, httpStatus: number, appCode?: string): RpcAnswer => ({
    error: { code, httpStatus, appCode },
});

/** Ответ, который тест отпускает сам. */
export function held(answer: RpcAnswer) {
    const { promise, resolve } = Promise.withResolvers<RpcAnswer>();
    return { handler: () => promise, release: () => resolve(answer) };
}

/**
 * Подменяет `fetch` фейковым BFF.
 * @returns журнал вызовов, регистрация обработчиков и восстановление `fetch`
 */
export function fakeRpc() {
    const calls: RpcCall[] = [];
    const handlers = new Map<string, Handler[]>();
    const real = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'https://localhost');
        const paths = url.pathname.replace('/api/trpc/', '').split(',');
        const raw =
            init?.method === 'POST'
                ? (init.body as string)
                : (url.searchParams.get('input') ?? '{}');
        const inputs = JSON.parse(raw) as Record<string, unknown>;
        const answers = await Promise.all(
            paths.map(async (path, i) => {
                const call = { path, input: inputs[String(i)] };
                calls.push(call);
                const queue = handlers.get(path);
                const handler = queue && queue.length > 1 ? queue.shift() : queue?.[0];
                if (!handler) throw new Error(`нет ответа для ${path}`);
                return handler(call.input, call);
            }),
        );
        if (answers.includes('network')) throw new TypeError('Failed to fetch');
        const body = answers.map((a) =>
            a !== 'network' && 'data' in a
                ? { result: { data: a.data } }
                : {
                      error: {
                          message: 'error',
                          code: -32_000,
                          data: (a as Exclude<RpcAnswer, 'network' | { data: unknown }>).error,
                      },
                  },
        );
        const failed = answers.find((a) => a !== 'network' && 'error' in a) as
            | { error: { httpStatus: number } }
            | undefined;
        return Response.json(body, { status: failed ? failed.error.httpStatus : 200 });
    }) as typeof fetch;

    return {
        calls,
        /** Ответы процедуры по очереди; последний повторяется. */
        on(path: string, ...answers: Handler[]) {
            handlers.set(path, answers);
        },
        restore() {
            globalThis.fetch = real;
        },
    };
}
