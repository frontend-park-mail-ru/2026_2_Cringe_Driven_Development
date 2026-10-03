import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { ReleaseError, isSha, need } from './env.ts';

export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const NO_CACHE = 'no-cache';
const HTML = 'text/html; charset=utf-8';

/** current.json: stable — текущий релиз, previous — релиз, на который вернёт откат */
export interface Current {
    stable: string;
    previous: string | null;
}

export interface Bucket {
    client: S3Client;
    name: string;
}

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

/** null — файла ещё нет (первый релиз) */
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

export async function writeCurrent(bucket: Bucket, current: Current): Promise<void> {
    await putObject(bucket, 'current.json', JSON.stringify(current), 'application/json', NO_CACHE);
}

/** releases/{sha}/index.html → корневой index.html, его отдаёт Caddy */
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

export interface StoredObject {
    key: string;
    modified: number;
}

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

export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.name, Key: key }));
}
