/** HTTP-метод операции: литерал в верхнем регистре. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * Отправка запроса: путь операции с query и `RequestInit` → стандартный `Response`. Адрес сервера,
 * авторизация, таймаут и учёт запросов — забота транспорта, разбор тела — общего клиента.
 */
export type Transport = (path: string, init: RequestInit) => Promise<Response>;

/** Значение query-параметра; массив уходит повторяемыми ключами (form/explode). */
export type QueryValue =
    | string
    | number
    | boolean
    | undefined
    | readonly (string | number | boolean)[];

/** Описание операции в карте типов: параметры, тела по content type и ответы по статусам. */
export interface Operation {
    params?: {
        path?: Record<string, string | number>;
        query?: Record<string, QueryValue>;
        header?: Record<string, string>;
    };
    body?: {
        'application/json'?: unknown;
        'multipart/form-data'?: Record<string, string | Blob>;
    };
    responses: Record<number, unknown>;
}

/** Карта операций: шаблон пути → HTTP-метод → операция. */
export type Paths = Record<string, Partial<Record<HttpMethod, Operation>>>;

type ParamsOption<O> = O extends { params: infer P }
    ? {} extends P
        ? { params?: P }
        : { params: P }
    : Pick<O, 'params' & keyof O>;

type BodyOption<O> = O extends { body: infer B }
    ? { [K in keyof B]: { contentType: K; body: B[K] } }[keyof B]
    : { contentType?: never; body?: never };

/** Опции вызова операции: типизированные параметры, тело с content type и прочий `init`. */
export type RequestOptions<O> = ParamsOption<O> &
    BodyOption<O> & { init?: Omit<RequestInit, 'method' | 'body'> };

declare const operation: unique symbol;

/**
 * Разобранный ответ. `data` не проверено: тело JSON, иначе текст, без тела — `undefined`. Тип
 * ответов операции связан с результатом только на уровне типов: DTO статуса — `ResponseData`,
 * после проверки приложением.
 */
export interface ApiResponse<O extends Operation = Operation> {
    status: number;
    headers: Headers;
    data: unknown;
    readonly [operation]?: O['responses'];
}

/** Тип тела ответа операции `O` со статусом `S` по карте типов. */
export type ResponseData<O extends Operation, S extends keyof O['responses']> = O['responses'][S];

/** Клиент по карте операций `P`. */
export interface Client<P extends Paths> {
    request<Path extends keyof P & string, M extends keyof P[Path] & HttpMethod>(
        method: M,
        path: Path,
        ...options: {} extends RequestOptions<P[Path][M]>
            ? [options?: RequestOptions<P[Path][M]>]
            : [options: RequestOptions<P[Path][M]>]
    ): Promise<ApiResponse<P[Path][M] & Operation>>;
}

type RawOptions = {
    params?: Operation['params'];
    contentType?: keyof NonNullable<Operation['body']>;
    body?: unknown;
    init?: RequestInit;
};

function toPath(template: string, params: RawOptions['params']): string {
    const path = template.replace(/\{(\w+)\}/g, (_, name: string) => {
        const value = params?.path?.[name];
        if (value === undefined) throw new TypeError(`Нет path-параметра ${name}`);
        return encodeURIComponent(String(value));
    });
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params?.query ?? {})) {
        for (const item of Array.isArray(value) ? value : [value]) {
            if (item !== undefined) query.append(key, String(item));
        }
    }
    const search = query.toString();
    return search ? `${path}?${search}` : path;
}

function parse(text: string): unknown {
    if (text === '') return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * Клиент по карте операций: собирает путь, query, заголовки и тело, отправляет через транспорт и
 * один раз разбирает ответ. HTTP-ошибки возвращаются результатом, сбои транспорта и чтения тела —
 * исключением как есть.
 * @param config транспорт отправки
 * @returns независимый экземпляр клиента
 */
export function createClient<P extends Paths>(config: { transport: Transport }): Client<P> {
    const request = async (
        method: HttpMethod,
        template: string,
        options: RawOptions = {},
    ): Promise<ApiResponse> => {
        const { params, contentType, body, init } = options;
        const path = toPath(template, params);
        const headers = new Headers(init?.headers);
        for (const [name, value] of Object.entries(params?.header ?? {})) headers.set(name, value);
        let payload: RequestInit['body'];
        if (contentType === 'application/json') {
            headers.set('Content-Type', contentType);
            payload = JSON.stringify(body);
        } else if (contentType === 'multipart/form-data') {
            // boundary ставит fetch по FormData
            headers.delete('Content-Type');
            const form = new FormData();
            for (const [name, value] of Object.entries(body as Record<string, string | Blob>)) {
                form.append(name, value);
            }
            payload = form;
        }
        const res = await config.transport(path, { ...init, method, headers, body: payload });
        const text = method === 'HEAD' || res.status === 204 ? '' : await res.text();
        return { status: res.status, headers: res.headers, data: parse(text) };
    };
    return { request } as Client<P>;
}
