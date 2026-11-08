import {
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { ReleaseError, need } from './env.ts';

/** Cache-Control файлов релиза: в именах хэш, содержимое не меняется. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Cache-Control для index.html релиза: перед отдачей из кэша ответ сверяется с бакетом. */
export const NO_CACHE = 'no-cache';

/** Бакет релизов: клиент S3 и имя бакета. */
export interface Bucket {
    client: S3Client;
    name: string;
}

/** Клиент S3 и бакет из переменных S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY. */
export function openBucket(): Bucket {
    const endpoint = need('S3_ENDPOINT');
    /** Регион подписи у Selectel — пул из адреса: https://s3.<пул>.storage.selcloud.ru */
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
        /** S3 Selectel не считает контрольные суммы, которые SDK шлёт по умолчанию */
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return { client, name: need('S3_BUCKET') };
}

/** Записывает объект в бакет с заголовками Content-Type и Cache-Control. */
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
 * Содержимое объекта бакета.
 * @returns байты объекта или undefined, если его нет
 */
export async function readObject(bucket: Bucket, key: string): Promise<Uint8Array | undefined> {
    try {
        const res = await bucket.client.send(
            new GetObjectCommand({ Bucket: bucket.name, Key: key }),
        );
        return await res.Body?.transformToByteArray();
    } catch (err) {
        if (err instanceof NoSuchKey || err instanceof NotFound) return undefined;
        throw err;
    }
}

/** Объект бакета: ключ и время последней записи, мс. */
export interface StoredObject {
    key: string;
    modified: number;
}

/** Все объекты бакета с префиксом ключей, со всех страниц выдачи. */
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

/** Удаляет объект из бакета. */
export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.name, Key: key }));
}
