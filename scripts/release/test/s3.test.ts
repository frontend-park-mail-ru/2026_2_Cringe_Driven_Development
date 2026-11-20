import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    IMMUTABLE,
    deleteObject,
    listObjects,
    openBucket,
    putObject,
    readObject,
    sign,
} from '../s3.ts';
import { fakeS3 } from './s3-fake.ts';

// Эталон: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const aws = {
    region: 'us-east-1',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    payloadHash: EMPTY,
};
const awsHeaders = {
    host: 'examplebucket.s3.amazonaws.com',
    'x-amz-content-sha256': EMPTY,
    'x-amz-date': '20130524T000000Z',
};
const credential =
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request';

test('sign matches AWS GET Object example', () => {
    expect(
        sign({
            ...aws,
            method: 'GET',
            path: '/test.txt',
            query: [],
            headers: { ...awsHeaders, range: 'bytes=0-9' },
        }),
    ).toBe(
        `${credential},SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41`,
    );
});

test('sign matches AWS ListObjects example with unsorted query', () => {
    expect(
        sign({
            ...aws,
            method: 'GET',
            path: '/',
            query: [
                ['prefix', 'J'],
                ['max-keys', '2'],
            ],
            headers: awsHeaders,
        }),
    ).toBe(
        `${credential},SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7`,
    );
});

let s3: ReturnType<typeof fakeS3>;
beforeEach(() => (s3 = fakeS3()));
afterEach(() => s3.restore());

const KEY = 'releases/a b/ф+$~(1).js';
const bytes = new Uint8Array([0, 1, 2, 255]);

test('putObject sends bytes, headers, encoded path and body hash', async () => {
    await putObject(openBucket(), KEY, bytes, 'text/javascript; charset=utf-8', IMMUTABLE);
    const [req] = s3.requests;
    expect(req!.method).toBe('PUT');
    expect(String(req!.url)).toBe(
        'https://s3.ru-1.storage.selcloud.ru/bucket/releases/a%20b/%D1%84%2B%24~%281%29.js',
    );
    expect(req!.body).toEqual(bytes);
    expect(req!.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(req!.headers.get('cache-control')).toBe(IMMUTABLE);
    expect(req!.headers.get('x-amz-content-sha256')).toBe(
        createHash('sha256').update(bytes).digest('hex'),
    );
    expect(req!.headers.get('authorization')).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/ru-1\/s3\/aws4_request,SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date,Signature=[0-9a-f]{64}$/,
    );
    expect(s3.objects.get(KEY)?.body).toEqual(bytes);
});

test('S3_REGION overrides region from endpoint', async () => {
    process.env.S3_REGION = 'ru-7';
    await putObject(openBucket(), 'k', 'x', 'text/plain', IMMUTABLE);
    expect(s3.requests[0]!.headers.get('authorization')).toContain('/ru-7/s3/aws4_request');
});

test('readObject returns stored bytes', async () => {
    s3.put(KEY, bytes);
    expect(await readObject(openBucket(), KEY)).toEqual(bytes);
});

test('readObject returns undefined only for NoSuchKey', async () => {
    expect(await readObject(openBucket(), 'releases/none')).toBeUndefined();
});

test.each([
    [403, 'AccessDenied'],
    [404, 'NoSuchBucket'],
    [500, 'InternalError'],
])('readObject throws %i %s with operation and without secrets', async (status, code) => {
    s3.override = () =>
        new Response(`<Error><Code>${code}</Code><Message>m</Message></Error>`, { status });
    const err = await readObject(openBucket(), 'releases/x').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = String((err as Error).message);
    expect(message).toContain('GetObject releases/x');
    expect(message).toContain(`${status} ${code}`);
    expect(message).not.toMatch(/SECRET|AKID|AWS4|uthorization/);
});

test('listObjects reads all pages with keys and LastModified', async () => {
    s3.pageSize = 2;
    for (const key of [
        'releases/s/a&b<c>.js',
        'releases/s/b',
        'releases/t/c',
        'releases/t/d',
        'releases/u/e',
        'other/x',
    ])
        s3.put(key);
    const list = await listObjects(openBucket(), 'releases/');
    expect(list.map((item) => item.key)).toEqual([
        'releases/s/a&b<c>.js',
        'releases/s/b',
        'releases/t/c',
        'releases/t/d',
        'releases/u/e',
    ]);
    expect(list[0]!.modified).toBe(s3.objects.get('releases/s/a&b<c>.js')!.modified);
    expect(s3.requests).toHaveLength(3);
    expect(s3.requests[0]!.url.searchParams.get('list-type')).toBe('2');
    expect(s3.requests[0]!.url.searchParams.get('prefix')).toBe('releases/');
    expect(s3.requests[1]!.url.searchParams.get('continuation-token')).toBe('2');
});

const listing = (inner: string) =>
    new Response(`<?xml version="1.0"?><ListBucketResult>${inner}</ListBucketResult>`);

test.each([
    ['truncated page without token', '<IsTruncated>true</IsTruncated>'],
    [
        'page without IsTruncated',
        '<Contents><Key>k</Key><LastModified>2026-11-01T00:00:00Z</LastModified></Contents>',
    ],
    [
        'object without LastModified',
        '<IsTruncated>false</IsTruncated><Contents><Key>k</Key></Contents>',
    ],
])('listObjects throws on %s', async (_, inner) => {
    s3.override = () => listing(inner);
    await expect(listObjects(openBucket(), 'releases/')).rejects.toThrow('ListObjectsV2');
});

test('listObjects throws on non-XML page', async () => {
    s3.override = () => new Response('<html>proxy</html>');
    await expect(listObjects(openBucket(), 'releases/')).rejects.toThrow('ListObjectsV2');
});

test('listObjects throws on repeated continuation token', async () => {
    s3.override = () =>
        listing('<IsTruncated>true</IsTruncated><NextContinuationToken>t</NextContinuationToken>');
    await expect(listObjects(openBucket(), 'releases/')).rejects.toThrow('ListObjectsV2');
    expect(s3.requests.length).toBeLessThanOrEqual(2);
});

test('deleteObject sends DELETE for encoded key', async () => {
    s3.put(KEY);
    await deleteObject(openBucket(), KEY);
    expect(s3.requests[0]!.method).toBe('DELETE');
    expect(s3.requests[0]!.url.pathname).toBe('/bucket/releases/a%20b/%D1%84%2B%24~%281%29.js');
    expect(s3.objects.has(KEY)).toBe(false);
});

test('deleteObject throws on S3 error', async () => {
    s3.override = () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
    await expect(deleteObject(openBucket(), 'k')).rejects.toThrow(
        'DeleteObject k: 403 AccessDenied',
    );
});
