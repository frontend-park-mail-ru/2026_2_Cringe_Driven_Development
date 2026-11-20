import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distArchive } from '../archives.ts';
import { retention } from '../retention.ts';
import { upload } from '../upload.ts';
import { fixture } from './fixture.ts';
import { fakeS3 } from './s3-fake.ts';

const SHA = 'f'.repeat(40);
let s3: ReturnType<typeof fakeS3>;
let dir: string;
beforeEach(() => {
    s3 = fakeS3();
    dir = mkdtempSync(join(tmpdir(), 'release-s3-'));
});
afterEach(() => {
    s3.restore();
    rmSync(dir, { recursive: true, force: true });
});

function dist(files: Record<string, string>): string {
    const root = join(dir, 'dist');
    for (const [name, content] of Object.entries(files)) {
        mkdirSync(join(root, name, '..'), { recursive: true });
        writeFileSync(join(root, name), content);
    }
    return root;
}
const quiet = () => spyOn(console, 'log').mockImplementation(() => {});

test('upload failure before index.html leaves release incomplete', async () => {
    const root = dist({ 'index.html': 'i', 'assets/a.js': 'a', 'assets/b.css': 'b' });
    s3.override = (req) =>
        req.method === 'PUT' && req.url.pathname.endsWith('b.css')
            ? new Response('<Error><Code>InternalError</Code></Error>', { status: 500 })
            : undefined;
    await expect(upload(SHA, root)).rejects.toThrow(
        'PutObject releases/' + SHA + '/assets/b.css: 500',
    );
    expect(
        s3.requests.some((req) => req.url.pathname.endsWith('index.html') && req.method === 'PUT'),
    ).toBe(false);
    expect(s3.objects.has(`releases/${SHA}/index.html`)).toBe(false);
});

test('upload stores headers and index.html last; rerun compares bytes', async () => {
    const log = quiet();
    try {
        const root = dist({ 'index.html': 'i', 'assets/a.js': 'a' });
        await upload(SHA, root);
        const puts = s3.requests
            .filter((req) => req.method === 'PUT')
            .map((req) => req.url.pathname);
        expect(puts.at(-1)).toBe(`/bucket/releases/${SHA}/index.html`);
        expect(s3.objects.get(`releases/${SHA}/assets/a.js`)).toMatchObject({
            type: 'text/javascript; charset=utf-8',
            cache: 'public, max-age=31536000, immutable',
        });
        expect(s3.objects.get(`releases/${SHA}/index.html`)?.cache).toBe('no-cache');

        s3.requests.length = 0;
        await upload(SHA, root);
        expect(s3.requests.filter((req) => req.method === 'PUT')).toHaveLength(0);

        writeFileSync(join(root, 'assets/a.js'), 'changed');
        await expect(upload(SHA, root)).rejects.toThrow('уже залит');
    } finally {
        log.mockRestore();
    }
});

const gnuTar = Bun.spawnSync(['tar', '--version']).stdout.toString().includes('GNU tar');

test.skipIf(!gnuTar)('distArchive takes every file of a multi-page listing', async () => {
    s3.pageSize = 1;
    const files = { 'index.html': 'i', 'assets/a.js': 'a', 'assets/b c.css': 'b' };
    for (const [name, content] of Object.entries(files)) s3.put(`releases/${SHA}/${name}`, content);
    const out = await distArchive(SHA, dir);
    const check = join(dir, 'unpacked');
    mkdirSync(check);
    Bun.spawnSync(['tar', '-xzf', out, '-C', check]);
    for (const [name, content] of Object.entries(files))
        expect(readFileSync(join(check, name), 'utf8')).toBe(content);
});

const releases = (f: ReturnType<typeof fixture>) => {
    // f.a — самый старый, но защищён выкаткой прода
    const shas = [f.a, ...'123456'.split('').map((c) => c.repeat(40))];
    for (const sha of shas) {
        s3.put(`releases/${sha}/index.html`);
        s3.put(`releases/${sha}/assets/x.js`);
    }
    s3.put('releases/README.txt');
    return shas;
};

/** Ретеншн на фикстуре GitHub: фейковый S3 по 3 объекта на страницу поверх её fetch. */
async function withProduction(run: (f: ReturnType<typeof fixture>) => Promise<void>) {
    s3.restore();
    const f = fixture();
    s3 = fakeS3(3);
    const log = quiet();
    try {
        f.production('deploy', f.a);
        await run(f);
    } finally {
        log.mockRestore();
        s3.restore();
        f.restore();
        s3 = fakeS3();
    }
}

test('retention keeps five newest and protected production release', () =>
    withProduction(async (f) => {
        const shas = releases(f);
        await retention();
        const left = new Set([...s3.objects.keys()].map((key) => key.split('/')[1]));
        expect(left).toEqual(new Set([f.a, ...shas.slice(2), 'README.txt']));
        const deletes = s3.requests.filter((req) => req.method === 'DELETE');
        expect(deletes.map((req) => decodeURIComponent(req.url.pathname))).toEqual([
            `/bucket/releases/${shas[1]}/index.html`,
            `/bucket/releases/${shas[1]}/assets/x.js`,
        ]);
    }));

test('retention deletes nothing when a listing page is broken', () =>
    withProduction(async (f) => {
        releases(f);
        s3.override = (req) =>
            req.url.searchParams.get('continuation-token') === '6'
                ? new Response(
                      '<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>',
                  )
                : undefined;
        await expect(retention()).rejects.toThrow('ListObjectsV2 releases/');
        expect(s3.requests.filter((req) => req.method === 'DELETE')).toHaveLength(0);
        expect(
            s3.requests.filter((req) => req.url.searchParams.has('continuation-token')),
        ).toHaveLength(2);
    }));
