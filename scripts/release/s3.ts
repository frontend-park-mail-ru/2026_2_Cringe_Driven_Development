import { createHash, createHmac } from 'node:crypto';
import { ReleaseError, need } from './env.ts';

/** Cache-Control файлов релиза: в именах хэш, содержимое не меняется. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Cache-Control для index.html релиза: перед отдачей из кэша ответ сверяется с бакетом. */
export const NO_CACHE = 'no-cache';

/** Предел одного запроса к S3, мс. */
const TIMEOUT = 30_000;

/** Бакет релизов: адрес S3, регион подписи, имя бакета и ключи доступа. */
export interface Bucket {
    endpoint: string;
    region: string;
    name: string;
    accessKey: string;
    secretKey: string;
}

/** Бакет из переменных S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY и S3_REGION. */
export function openBucket(): Bucket {
    const endpoint = need('S3_ENDPOINT');
    /** Регион подписи у Selectel — пул из адреса: https://s3.<пул>.storage.selcloud.ru */
    const region = process.env.S3_REGION || /^https?:\/\/s3\.([^./]+)\./.exec(endpoint)?.[1];
    if (!region) {
        throw new ReleaseError('Не удалось взять регион из S3_ENDPOINT, задайте S3_REGION');
    }
    return {
        endpoint,
        region,
        name: need('S3_BUCKET'),
        accessKey: need('S3_ACCESS_KEY'),
        secretKey: need('S3_SECRET_KEY'),
    };
}

/** RFC 3986, как в подписи S3: без кодирования остаются только A-Z a-z 0-9 - _ . ~ */
const encode = (value: string) =>
    encodeURIComponent(value).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) =>
    createHmac('sha256', key).update(data).digest();
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
const canonicalQuery = (query: [string, string][]) =>
    query
        .map(([name, value]) => `${encode(name)}=${encode(value)}`)
        .toSorted()
        .join('&');

/** Запрос для подписи AWS SigV4. */
export interface SignInput {
    method: string;
    /** путь запроса, уже закодированный, как в URL */
    path: string;
    query: [string, string][];
    /** заголовки для подписи в нижнем регистре, среди них host, x-amz-date и x-amz-content-sha256 */
    headers: Record<string, string>;
    region: string;
    accessKey: string;
    secretKey: string;
}

/**
 * Подпись AWS SigV4 для S3: подписываются все переданные заголовки, дата — из x-amz-date.
 * @returns значение заголовка Authorization
 */
export function sign(req: SignInput): string {
    const { headers } = req;
    const names = Object.keys(headers).toSorted();
    const signed = names.join(';');
    const date = headers['x-amz-date'] ?? '';
    const canonical = [
        req.method,
        req.path,
        canonicalQuery(req.query),
        names.map((name) => `${name}:${headers[name]}\n`).join(''),
        signed,
        headers['x-amz-content-sha256'],
    ].join('\n');
    const scope = `${date.slice(0, 8)}/${req.region}/s3/aws4_request`;
    let key = hmac(`AWS4${req.secretKey}`, date.slice(0, 8));
    for (const part of [req.region, 's3', 'aws4_request']) key = hmac(key, part);
    const signature = hmac(key, ['AWS4-HMAC-SHA256', date, scope, sha256(canonical)].join('\n'));
    return `AWS4-HMAC-SHA256 Credential=${req.accessKey}/${scope},SignedHeaders=${signed},Signature=${signature.toString('hex')}`;
}

/** Ответ S3 с ошибкой: код из XML ответа, без ключей и заголовков. */
class S3Error extends ReleaseError {
    constructor(
        message: string,
        readonly code: string,
    ) {
        super(message);
    }
}

/**
 * Подписанный запрос к объекту бакета (path-style); возвращает байты тела ответа. Не 2xx, обрыв
 * или таймаут — {@link S3Error} с операцией, ключом (у листинга — префиксом) и кодом ответа.
 */
async function send(
    bucket: Bucket,
    op: string,
    method: string,
    key: string,
    {
        query = [],
        body = new Uint8Array(),
        headers: extra = {},
    }: { query?: [string, string][]; body?: Uint8Array; headers?: Record<string, string> } = {},
): Promise<Uint8Array> {
    const what = key || Object.fromEntries(query).prefix;
    const base = new URL(bucket.endpoint);
    const path = `${base.pathname.replace(/\/+$/, '')}/${encode(bucket.name)}/${key.split('/').map(encode).join('/')}`;
    const payloadHash = sha256(body);
    const headers = {
        ...extra,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''),
    };
    const authorization = sign({
        method,
        path,
        query,
        headers: { ...headers, host: base.host },
        region: bucket.region,
        accessKey: bucket.accessKey,
        secretKey: bucket.secretKey,
    });
    const search = canonicalQuery(query);
    let res: Response;
    let bytes: Uint8Array;
    try {
        res = await fetch(`${base.origin}${path}${search ? `?${search}` : ''}`, {
            method,
            headers: { ...headers, authorization },
            body: method === 'PUT' ? body : undefined,
            signal: AbortSignal.timeout(TIMEOUT),
        });
        // тело — внутри try: обрыв или таймаут при чтении тоже называют операцию и ключ
        bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
        throw new S3Error(`${op} ${what}: ${(err as Error).name} ${(err as Error).message}`, '');
    }
    if (res.ok) return bytes;
    const code = tag(new TextDecoder().decode(bytes), 'Code') ?? '';
    throw new S3Error(`${op} ${what}: ${res.status} ${code}`.trimEnd(), code);
}

/** Записывает объект в бакет с заголовками Content-Type и Cache-Control. */
export async function putObject(
    bucket: Bucket,
    key: string,
    body: Uint8Array | string,
    contentType: string,
    cacheControl: string,
): Promise<void> {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    await send(bucket, 'PutObject', 'PUT', key, {
        body: bytes,
        headers: { 'cache-control': cacheControl, 'content-type': contentType },
    });
}

/**
 * Содержимое объекта бакета.
 * @returns байты объекта или undefined, если его нет (NoSuchKey)
 */
export async function readObject(bucket: Bucket, key: string): Promise<Uint8Array | undefined> {
    try {
        return await send(bucket, 'GetObject', 'GET', key);
    } catch (err) {
        if (err instanceof S3Error && err.code === 'NoSuchKey') return undefined;
        throw err;
    }
}

/** Объект бакета: ключ и время последней записи, мс. */
export interface StoredObject {
    key: string;
    modified: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (value: string) =>
    value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) =>
        entity.startsWith('#')
            ? String.fromCodePoint(Number(entity.replace(/^#x/i, '0x').replace('#', '')))
            : ENTITIES[entity]!,
    );

/**
 * Все объекты бакета с префиксом ключей, со всех страниц ListObjectsV2. Некорректная страница,
 * пропущенный или повторившийся токен продолжения — {@link ReleaseError}: неполный список
 * не возвращается.
 */
export async function listObjects(bucket: Bucket, prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    const seen = new Set<string>();
    const bad = (why: string) =>
        new ReleaseError(`ListObjectsV2 ${prefix}: некорректная страница — ${why}`);
    let token: string | undefined;
    do {
        const query: [string, string][] = [
            ['list-type', '2'],
            ['prefix', prefix],
        ];
        if (token) query.push(['continuation-token', token]);
        const page = new TextDecoder().decode(
            await send(bucket, 'ListObjectsV2', 'GET', '', { query }),
        );
        if (!/<ListBucketResult[\s>]/.test(page)) throw bad('нет ListBucketResult');
        const truncated = tag(page, 'IsTruncated');
        if (truncated !== 'true' && truncated !== 'false') throw bad('нет IsTruncated');
        for (const [, item = ''] of page.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
            const key = tag(item, 'Key');
            const modified = Date.parse(tag(item, 'LastModified') ?? '');
            if (key === undefined || Number.isNaN(modified))
                throw bad('объект без Key или LastModified');
            objects.push({ key: unescapeXml(key), modified });
        }
        const next = tag(page, 'NextContinuationToken');
        token = truncated === 'true' ? next && unescapeXml(next) : undefined;
        if (truncated === 'true' && !token) throw bad('нет NextContinuationToken');
        if (token && seen.has(token)) throw bad('токен продолжения повторился');
        if (token) seen.add(token);
    } while (token);
    return objects;
}

/** Удаляет объект из бакета. */
export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
    await send(bucket, 'DeleteObject', 'DELETE', key);
}
