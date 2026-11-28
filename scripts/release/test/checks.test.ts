import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHA = 'a'.repeat(40);
const CDN = 'https://cdn.example.org';
const BASE = `${CDN}/releases/${SHA}/`;
const page = (asset: string) =>
    `<meta name="release" content="${SHA}"><script type="module" crossorigin src="${BASE}${asset}"></script>`;

process.env.CDN_URL = CDN;
process.env.CHECK_INTERVAL_MS = '0';
const { releaseCheck } = await import('../checks.ts');

let cwd: string;
let directory: string;
let requested: string[];
let adminOnCdn: boolean;

beforeEach(() => {
    cwd = process.cwd();
    directory = mkdtempSync(join(tmpdir(), 'release-check-'));
    process.chdir(directory);
    requested = [];
    adminOnCdn = false;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
        const target = String(url);
        requested.push(target);
        if (target === `${BASE}index.html`) return new Response(page('index.js'));
        if (target === `${BASE}onlineconf.html`)
            return new Response('admin', { status: adminOnCdn ? 200 : 403 });
        if (target.endsWith('.js')) {
            return new Response('', {
                headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' },
            });
        }
        return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    process.chdir(cwd);
    rmSync(directory, { recursive: true, force: true });
});

const withAdminBuild = () => {
    mkdirSync('apps/client/dist', { recursive: true });
    writeFileSync('apps/client/dist/onlineconf.html', page('admin.js'));
};

test('CD и Rollback проверяют только index.html и его ассеты: HTML админки с CDN не запрашивается', async () => {
    await releaseCheck(SHA);
    expect(requested).toEqual([`${BASE}index.html`, `${BASE}index.js`]);
});

test('в CI ассеты админки проверяются по HTML из сборки, а сам HTML на CDN закрыт', async () => {
    withAdminBuild();
    await releaseCheck(SHA);
    expect(requested).toContain(`${BASE}admin.js`);
});

test('доступный с CDN HTML админки — ошибка Release check', async () => {
    withAdminBuild();
    adminOnCdn = true;
    expect(releaseCheck(SHA)).rejects.toThrow('Release check не прошёл');
});
