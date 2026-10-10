import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { ReleaseError, isSha, need } from './env.ts';

/** Cache-Control файлов релиза: в именах хэш, содержимое не меняется. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Cache-Control для index.html и current.json: перед отдачей из кэша ответ сверяется с бакетом. */
export const NO_CACHE = 'no-cache';
const HTML = 'text/html; charset=utf-8';

/** current.json: stable — текущий релиз, previous — релиз, на который вернёт откат */
export interface Current {
    stable: string;
    previous: string | null;
}

/** Бакет релизов: клиент S3 и имя бакета. */
export interface Bucket {
    client: S3Client;
    name: string;
}

/**
 * Клиент S3 и бакет из переменных S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY.
 * @returns {Bucket} бакет релизов
 */
export function openBucket(): Bucket {
    const endpoint = need('S3_ENDPOINT');
    // регион подписи у Selectel — пул из адреса: https://s3.<пул>.storage.selcloud.ru
    const region = process.env.S3_REGION || /^https?:\/\/s3\.([^./]+)\./.exec(endpoint)?.[1];
    if (!region) {
        throw new ReleaseError('Не удалось взять регион из S3_ENDPOINT, задайте S3_REGION');
    }
    const client = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: {
            accessKeyId: need('S3_ACCESS_KEY'),
            secretAccessKey: need('S3_SECRET_KEY'),
        },
        // S3 Selectel не считает контрольные суммы, которые SDK шлёт по умолчанию
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return { client, name: need('S3_BUCKET') };
}

/**
 * Записывает объект в бакет.
 * @param {Bucket} bucket бакет
 * @param {string} key ключ объекта
 * @param {Uint8Array | string} body содержимое
 * @param {string} contentType значение Content-Type
 * @param {string} cacheControl значение Cache-Control
 */
export async function putObject(
    bucket: Bucket,
    key: string,
    body: Uint8Array | string,
    contentType: string,
    cacheControl: string,
): Promise<void> {
    await bucket.client.send(
        new PutObjectCommand({
            Bucket: bucket.name,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: cacheControl,
        }),
    );
}

/**
 * Релиз залит целиком: upload пишет index.html последним.
 * @param {Bucket} bucket бакет
 * @param {string} sha sha релиза
 * @returns {Promise<boolean>} true, если в бакете есть index.html релиза
 */
export async function hasRelease(bucket: Bucket, sha: string): Promise<boolean> {
    try {
        await bucket.client.send(
            new HeadObjectCommand({ Bucket: bucket.name, Key: `releases/${sha}/index.html` }),
        );
        return true;
    } catch (err) {
        if (err instanceof NotFound) return false;
        throw err;
    }
}

/**
 * Читает current.json.
 * @param {Bucket} bucket бакет
 * @returns {Promise<Current | null>} указатель релиза; null — файла ещё нет (первый релиз)
 */
export async function readCurrent(bucket: Bucket): Promise<Current | null> {
    let text: string | undefined;
    try {
        const res = await bucket.client.send(
            new GetObjectCommand({ Bucket: bucket.name, Key: 'current.json' }),
        );
        text = await res.Body?.transformToString();
    } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
    }
    const data: unknown = JSON.parse(text ?? '');
    if (typeof data !== 'object' || data === null) {
        throw new ReleaseError(`current.json — не объект: ${text}`);
    }
    const { stable, previous = null } = data as Record<string, unknown>;
    if (typeof stable !== 'string' || !isSha(stable)) {
        throw new ReleaseError(`В current.json stable — не sha: ${text}`);
    }
    if (previous !== null && (typeof previous !== 'string' || !isSha(previous))) {
        throw new ReleaseError(`В current.json previous — не sha: ${text}`);
    }
    return { stable, previous };
}

/**
 * Записывает current.json.
 * @param {Bucket} bucket бакет
 * @param {Current} current указатель релиза
 */
export async function writeCurrent(bucket: Bucket, current: Current): Promise<void> {
    await putObject(bucket, 'current.json', JSON.stringify(current), 'application/json', NO_CACHE);
}

/**
 * releases/{sha}/index.html → корневой index.html, его отдаёт Caddy.
 * @param {Bucket} bucket бакет
 * @param {string} sha sha релиза
 */
export async function publishIndex(bucket: Bucket, sha: string): Promise<void> {
    await bucket.client.send(
        new CopyObjectCommand({
            Bucket: bucket.name,
            Key: 'index.html',
            CopySource: `${bucket.name}/releases/${sha}/index.html`,
            MetadataDirective: 'REPLACE',
            ContentType: HTML,
            CacheControl: NO_CACHE,
        }),
    );
}

/** Объект бакета: ключ и время последней записи, мс. */
export interface StoredObject {
    key: string;
    modified: number;
}

/**
 * Все объекты бакета с префиксом, со всех страниц выдачи.
 * @param {Bucket} bucket бакет
 * @param {string} prefix префикс ключей
 * @returns {Promise<StoredObject[]>} объекты
 */
export async function listObjects(bucket: Bucket, prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let token: string | undefined;
    do {
        const page = await bucket.client.send(
            new ListObjectsV2Command({
                Bucket: bucket.name,
                Prefix: prefix,
                ContinuationToken: token,
            }),
        );
        for (const item of page.Contents ?? []) {
            if (item.Key)
                objects.push({ key: item.Key, modified: item.LastModified?.getTime() ?? 0 });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
}

/**
 * Удаляет объект из бакета.
 * @param {Bucket} bucket бакет
 * @param {string} key ключ объекта
 */
export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.name, Key: key }));
}
