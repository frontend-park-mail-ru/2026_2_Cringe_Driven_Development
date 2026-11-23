/** Адрес фейкового S3: пул ru-1 — регион подписи. */
export const S3_HOST = 's3.ru-1.storage.selcloud.ru';

/** Запрос, дошедший до фейкового S3. */
export interface S3Request {
    method: string;
    url: URL;
    headers: Headers;
    body: Uint8Array;
    signal: AbortSignal | null | undefined;
}

const xml = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const error = (status: number, code: string) =>
    new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`, {
        status,
    });

/**
 * Бакет S3 в памяти за globalThis.fetch: path-style `https://S3_HOST/bucket/<key>`, переменные
 * S3_* на время теста. Запросы к другим хостам уходят в прежний fetch; сети нет.
 * @param pageSize объектов на страницу ListObjectsV2
 */
export function fakeS3(pageSize = 1000) {
    const env = { ...process.env };
    const previous = globalThis.fetch;
    Object.assign(process.env, {
        S3_ENDPOINT: `https://${S3_HOST}`,
        S3_BUCKET: 'bucket',
        S3_ACCESS_KEY: 'AKID',
        S3_SECRET_KEY: 'SECRET/KEY',
    });
    delete process.env.S3_REGION;
    let clock = Date.parse('2026-11-01T00:00:00Z');
    const s3 = {
        objects: new Map<
            string,
            { body: Uint8Array; type: string | null; cache: string | null; modified: number }
        >(),
        requests: [] as S3Request[],
        pageSize,
        /** Подмена ответа: вернуть Response, чтобы ответить им вместо бакета */
        override: undefined as ((req: S3Request) => Response | undefined) | undefined,
        /** Правка XML страницы ListObjectsV2 перед ответом */
        rewrite: (body: string) => body,
        /** Кладёт объект; каждый следующий новее предыдущего */
        put(key: string, body: string | Uint8Array = key) {
            s3.objects.set(key, {
                body: typeof body === 'string' ? new TextEncoder().encode(body) : body,
                type: null,
                cache: null,
                modified: (clock += 1000),
            });
        },
        restore() {
            globalThis.fetch = previous;
            for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
            Object.assign(process.env, env);
        },
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.host !== S3_HOST) return previous(input, init);
        const req: S3Request = {
            method: init?.method ?? 'GET',
            url,
            headers: new Headers(init?.headers),
            body: new Uint8Array(await new Response(init?.body ?? null).arrayBuffer()),
            signal: init?.signal,
        };
        s3.requests.push(req);
        const replaced = s3.override?.(req);
        if (replaced) return replaced;
        if (!url.pathname.startsWith('/bucket/')) return error(404, 'NoSuchBucket');
        const key = decodeURIComponent(url.pathname.slice('/bucket/'.length));
        if (req.method === 'PUT') {
            s3.objects.set(key, {
                body: req.body,
                type: req.headers.get('content-type'),
                cache: req.headers.get('cache-control'),
                modified: (clock += 1000),
            });
            return new Response(null);
        }
        if (req.method === 'DELETE') {
            s3.objects.delete(key);
            return new Response(null, { status: 204 });
        }
        if (key) {
            const item = s3.objects.get(key);
            return item ? new Response(item.body) : error(404, 'NoSuchKey');
        }
        if (url.searchParams.get('list-type') !== '2') return error(400, 'InvalidRequest');
        const prefix = url.searchParams.get('prefix') ?? '';
        const keys = [...s3.objects.keys()].filter((k) => k.startsWith(prefix)).toSorted();
        const start = Number(url.searchParams.get('continuation-token') ?? 0);
        const end = start + s3.pageSize;
        const contents = keys
            .slice(start, end)
            .map(
                (k) =>
                    `<Contents><Key>${xml(k)}</Key><LastModified>${new Date(s3.objects.get(k)!.modified).toISOString()}</LastModified><Size>1</Size></Contents>`,
            )
            .join('');
        const more = end < keys.length;
        return new Response(
            s3.rewrite(
                `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>bucket</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${keys.slice(start, end).length}</KeyCount><IsTruncated>${more}</IsTruncated>${contents}${more ? `<NextContinuationToken>${end}</NextContinuationToken>` : ''}</ListBucketResult>`,
            ),
        );
    }) as typeof fetch;
    return s3;
}
