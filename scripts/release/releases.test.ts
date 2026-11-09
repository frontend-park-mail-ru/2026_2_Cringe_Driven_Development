import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, git, IMAGE, IMAGE_ID, REPO } from './test/fixture.ts';

// архивы собирают docker и GNU tar; здесь — те же файлы-заглушки
let archiveCalls: string[] = [];
mock.module('./archives.ts', () => ({
    distArchive: async (_sha: string, work: string) => {
        archiveCalls.push('dist');
        writeFileSync(join(work, 'frontend-dist.tar.gz'), 'dist-bytes');
        return join(work, 'frontend-dist.tar.gz');
    },
    imageArchive: async (_sha: string, _ref: string, _id: string, work: string) => {
        archiveCalls.push('image');
        writeFileSync(join(work, 'bff-image.tar.gz'), 'image-bytes');
        return join(work, 'bff-image.tar.gz');
    },
}));
mock.module('./checks.ts', () => ({
    releaseCheck: async () => {
        archiveCalls.push('cdn');
    },
    health: async () => {},
}));
const releases = await import('./releases.ts');
const { configDigestOf } = await import('./image.ts');
const { rollbackTarget } = await import('./deployments.ts');
const { importReleases } = await import('./import.ts');

let f: ReturnType<typeof fixture>;
const outputs = () => readFileSync(process.env.GITHUB_OUTPUT!, 'utf8');
const notification = (attempt: number) => ({
    base_sha: null,
    report_url: null,
    run_attempt: attempt,
});
const manifestOf = (release: { assets: { id: number; name: string }[] }) =>
    JSON.parse(
        new TextDecoder().decode(
            f.blobs.get(release.assets.find((asset) => asset.name === 'release.json')!.id),
        ),
    ) as Record<string, unknown>;

beforeEach(() => {
    f = fixture();
    archiveCalls = [];
    process.env.GITHUB_OUTPUT = join(f.dir, 'outputs');
    process.env.GITHUB_ENV = join(f.dir, 'env');
    process.env.GITHUB_RUN_ID = '1';
    process.env.GITHUB_RUN_ATTEMPT = '1';
    process.env.RUNNER_TEMP = f.dir;
    spyOn(console, 'log').mockImplementation(() => {});
    spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    mock.restore();
    f.restore();
});

test('полный immutable Release проходит проверку без скачивания архивов', async () => {
    const release = f.publish(f.b, 1);
    expect((await releases.verifyRelease(release as never, f.b)).image_ref).toBe(IMAGE);
    const downloaded = f.requests
        .map((request) => /\/releases\/assets\/(\d+)$/.exec(request.url.pathname)?.[1])
        .filter(Boolean)
        .map((id) => release.assets.find((asset) => asset.id === Number(id))!.name);
    expect(downloaded.toSorted()).toEqual(['SHA256SUMS', 'release.json']);
});

test.each([
    ['draft', { release: { draft: true } }],
    ['prerelease', { release: { prerelease: true } }],
    ['не immutable', { release: { immutable: false } }],
    ['чужой package', { manifest: { image_ref: `ghcr.io/x/bff@sha256:${'a'.repeat(64)}` } }],
    ['чужой каталог CDN', { manifest: { assets: 'releases/other/' } }],
    ['лишнее поле', { manifest: { schema: 1 } }],
    ['чужой CI URL', { manifest: { ci_run: 'https://evil.invalid/actions/runs/1' } }],
    ['attempt больше фактического', { manifest: { ci_run_attempt: 3 } }],
    [
        'публикация не импортом',
        { manifest: { publication_run: `https://github.com/${REPO}/actions/runs/20` } },
    ],
])('Release отвергается: %s', async (_name, patch) => {
    f.deploy(f.a, 20);
    const release = f.release(f.b, 1, patch as never);
    await expect(releases.verifyRelease(release as never, f.b)).rejects.toThrow();
});

test('Release отвергается при подмене тега, комплекта, размера и сумм', async () => {
    const check = (release: unknown) => releases.verifyRelease(release as never, f.b);
    let release = f.publish(f.b, 1);
    f.tags.set(release.tag_name, f.a);
    await expect(check(release)).rejects.toThrow('указывает на');
    f.tags.set(release.tag_name, f.b);
    await expect(check({ ...release, assets: release.assets.slice(1) })).rejects.toThrow();
    await expect(
        check({ ...release, assets: [...release.assets, { ...release.assets[0]!, id: 1 }] }),
    ).rejects.toThrow('повторный');
    await expect(
        check({
            ...release,
            assets: release.assets.map((asset) =>
                asset.name === 'bff-image.tar.gz' ? { ...asset, size: 2 * 1024 ** 3 } : asset,
            ),
        }),
    ).rejects.toThrow('2 GiB');
    await expect(
        check({
            ...release,
            assets: release.assets.map((asset) =>
                asset.name === 'frontend-dist.tar.gz'
                    ? { ...asset, digest: `sha256:${'0'.repeat(64)}` }
                    : asset,
            ),
        }),
    ).rejects.toThrow('SHA256SUMS');
    // другой источник: CI другого SHA
    release = f.publish(f.a, 2);
    f.runs.get(2)!.head_sha = f.b;
    await expect(releases.verifyRelease(release as never, f.a)).rejects.toThrow('источник');
});

test('публикация: draft → assets → publish, один immutable Release', async () => {
    f.runs.set(1, ciRun(f.b, 1));
    const id = await releases.publishRelease({
        sha: f.b,
        imageRef: IMAGE,
        notification: notification(1),
        body: 'body',
    });
    const [release] = f.releases;
    expect(f.releases).toHaveLength(1);
    expect(release).toMatchObject({
        id,
        draft: false,
        immutable: true,
        tag_name: `release-${f.b}`,
    });
    expect(release!.assets.map((asset) => asset.name).toSorted()).toEqual([
        'SHA256SUMS',
        'bff-image.tar.gz',
        'frontend-dist.tar.gz',
        'release.json',
    ]);
    expect(manifestOf(release!)).toEqual({
        sha: f.b,
        image_ref: IMAGE,
        image_id: IMAGE_ID,
        assets: `releases/${f.b}/`,
        ci_run: `https://github.com/${REPO}/actions/runs/1`,
        ci_run_attempt: 1,
        publication_run: `https://github.com/${REPO}/actions/runs/1`,
        notification: notification(1),
    });
    const order = f.requests
        .filter((request) => request.url.host === 'uploads.github.com')
        .map((request) => request.url.searchParams.get('name'));
    expect(order[0]).toBe('release.json');
    expect(order.at(-1)).toBe('SHA256SUMS');
    expect(outputs()).toContain(`release_id=${id}`);

    // повтор: перепроверка без новой версии и перезаписи
    const before = f.requests.length;
    await releases.publishRelease({
        sha: f.b,
        imageRef: IMAGE,
        notification: notification(2),
        body: 'body',
    });
    expect(
        f.requests
            .slice(before)
            .some((request) => request.init?.method && request.init.method !== 'GET'),
    ).toBe(false);
    await releases.published(f.b);
    expect(outputs()).toContain('published=true');
});

const ciRun = (sha: string, id: number) => ({
    id,
    workflow_id: 100,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    head_sha: sha,
    run_attempt: 2,
    repository: { full_name: REPO },
    head_repository: { full_name: REPO },
});

test('attempt 1 создал draft и упал, attempt 2 закончил с прежней сборкой', async () => {
    f.runs.set(1, ciRun(f.b, 1));
    let failImage = true;
    f.extra = (url) => {
        if (url.searchParams.get('name') === 'bff-image.tar.gz' && failImage) {
            failImage = false;
            return Response.json({}, { status: 502 });
        }
    };
    await expect(
        releases.publishRelease({
            sha: f.b,
            imageRef: IMAGE,
            notification: notification(1),
            body: '',
        }),
    ).rejects.toThrow('bff-image.tar.gz');
    expect(f.releases[0]!.draft).toBe(true);

    process.env.GITHUB_RUN_ATTEMPT = '2';
    await releases.published(f.b);
    expect(outputs()).toContain('build=false');
    expect(outputs()).toContain(`image_ref=${IMAGE}`);
    archiveCalls = [];
    await releases.publishRelease({
        sha: f.b,
        imageRef: IMAGE,
        notification: notification(2),
        body: '',
    });
    // клиент уже загружен в draft — заново собирается только недостающий образ
    expect(archiveCalls).toEqual(['image']);
    expect(f.releases).toHaveLength(1);
    expect(manifestOf(f.releases[0]!)).toMatchObject({
        ci_run_attempt: 1,
        notification: notification(2),
    });
    expect(f.releases[0]).toMatchObject({ draft: false, immutable: true });
});

test('draft без release.json не восстанавливается автоматически', async () => {
    f.release(f.b, 1, { release: { draft: true } });
    f.releases[0]!.assets = [];
    await expect(releases.published(f.b)).rejects.toThrow('состав не зафиксирован');
});

test('publish без включённой immutability не считается готовым', async () => {
    f.runs.set(1, ciRun(f.b, 1));
    f.immutableEnabled = false;
    await expect(
        releases.publishRelease({
            sha: f.b,
            imageRef: IMAGE,
            notification: notification(1),
            body: '',
        }),
    ).rejects.toThrow('immutable');
});

test('CD принимает существующий Release с SHA, отличным от SHA workflow', async () => {
    const release = f.publish(f.a, 3);
    await releases.artifacts(`release-${f.a}`);
    expect(outputs()).toContain(`sha=${f.a}`);
    expect(outputs()).toContain(`release_id=${release.id}`);
    expect(readFileSync(process.env.GITHUB_ENV!, 'utf8')).toBe(`SHA=${f.a}\n`);
    await expect(releases.artifacts(f.a)).rejects.toThrow('release-<полный SHA>');
    await expect(releases.artifacts(`release-${f.b}`)).rejects.toThrow('Нет опубликованного');
});

test.each(['', ' \t '])(
    'пустой тег %j выбирает новый коммит main, а не позднюю публикацию',
    async (tag) => {
        const newer = f.publish(f.b, 2);
        const older = f.publish(f.a, 1);
        Object.assign(newer, { published_at: '2026-11-08T10:00:00Z' });
        Object.assign(older, { published_at: '2026-11-09T10:00:00Z' });
        process.env.GITHUB_SHA = f.a;
        git(f.dir, 'checkout', '--detach', f.a);
        await releases.artifacts(tag, f.dir);
        expect(outputs()).toContain(`sha=${f.b}`);
        expect(outputs()).toContain(`release_id=${newer.id}`);
        expect(readFileSync(process.env.GITHUB_ENV!, 'utf8')).toBe(`SHA=${f.b}\n`);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(newer.html_url));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`release-${f.b}`));
        expect(git(f.dir, 'rev-parse', 'HEAD')).toBe(f.a);
    },
);

test('явный тег сохраняет выбор старого выпуска при наличии нового', async () => {
    f.publish(f.a, 1);
    f.publish(f.b, 2);
    await releases.artifacts(`  release-${f.a}  `, f.dir);
    expect(outputs()).toContain(`sha=${f.a}`);
});

test.each(['draft', 'prerelease'] as const)(
    'пустой тег пропускает %s и выпуски боковых веток',
    async (kind) => {
        f.publish(f.a, 1);
        f.publish(f.b, 2)[kind] = true;
        f.publish(f.outside, 3);
        f.publish(git(f.dir, 'rev-parse', `${f.b}^2`), 4);
        await releases.artifacts('', f.dir);
        expect(outputs()).toContain(`sha=${f.a}`);
    },
);

test('пустой тег учитывает Release на второй странице', async () => {
    const newer = f.publish(f.b, 2);
    const older = f.publish(f.a, 1);
    f.releases.unshift(
        ...Array.from({ length: 99 }, (_, i) => ({
            ...older,
            id: 10000 + i,
            tag_name: `unrelated-${i}`,
        })),
    );
    await releases.artifacts('', f.dir);
    expect(outputs()).toContain(`release_id=${newer.id}`);
    expect(
        f.requests.some(
            ({ url }) => url.pathname.endsWith('/releases') && url.searchParams.get('page') === '2',
        ),
    ).toBe(true);
});

test.each(['нет выпусков', 'нет main', 'ошибка API', 'повреждён новый', 'неоднозначный тег'])(
    'пустой тег: %s — остановка без outputs',
    async (scenario) => {
        if (scenario === 'нет main') git(f.dir, 'update-ref', '-d', 'refs/remotes/origin/main');
        if (scenario === 'ошибка API')
            f.extra = (url) =>
                url.pathname.endsWith('/releases')
                    ? new Response('unavailable', { status: 503 })
                    : undefined;
        if (scenario === 'повреждён новый' || scenario === 'неоднозначный тег') {
            f.publish(f.a, 1);
            const newer = f.publish(f.b, 2);
            if (scenario === 'повреждён новый') newer.immutable = false;
            else f.releases.push({ ...newer, id: newer.id + 10000 });
        }
        const message = {
            'нет выпусков': 'Нет опубликованного Release в истории main',
            'нет main': 'историю main',
            'ошибка API': '503',
            'повреждён новый': 'immutable',
            'неоднозначный тег': 'несколько Releases',
        }[scenario];
        await expect(releases.artifacts('', f.dir)).rejects.toThrow(message);
        expect(existsSync(process.env.GITHUB_OUTPUT!)).toBe(false);
        expect(existsSync(process.env.GITHUB_ENV!)).toBe(false);
    },
);

test('Rollback сверяет цель с Release; старые записи без release_id — по SHA и digest', async () => {
    f.deploy(f.a, 20);
    f.deploy(f.b, 21).payload.image_ref =
        `ghcr.io/cringe-driven-development-team/bff@sha256:${'b'.repeat(64)}`;
    await rollbackTarget();
    expect(outputs()).toContain(`sha=${f.a}`);
    expect(outputs()).toMatch(/release_id=\d+/);
    f.releases.splice(
        f.releases.findIndex((row) => row.tag_name === `release-${f.a}`),
        1,
    );
    await expect(rollbackTarget()).rejects.toThrow('Нет опубликованного');
});

test.each([undefined, 'error', 'failure'] as const)(
    'импорт переносит текущий и предыдущий production, источник — исходная попытка (поздняя попытка: %s)',
    async (late) => {
        const other = `ghcr.io/cringe-driven-development-team/bff@sha256:${'b'.repeat(64)}`;
        f.legacy(f.root, 5, '2026-10-01T00:00:00Z');
        f.legacy(f.a, 6, '2026-10-02T00:00:00Z');
        f.legacy(f.b, 7, '2026-10-03T00:00:00Z');
        f.records['release-artifacts']!.at(-1)!.payload = {
            image_ref: other,
            assets: `releases/${f.b}/`,
            ci_run: `https://github.com/${REPO}/actions/runs/7`,
            notification: { base_sha: null, report_url: null, run_attempt: 1 },
        };
        // CI выпуска перезапускали: последняя попытка 2, сборка — попытка 1
        f.runs.get(7)!.run_attempt = 2;
        for (const [sha, id, image] of [
            [f.root, 30, IMAGE],
            [f.a, 31, IMAGE],
            [f.b, 32, other],
        ] as const) {
            f.records.production!.unshift({
                id,
                sha,
                created_at: `2026-10-0${id - 29}T01:00:00Z`,
                payload: { image_ref: image, assets: `releases/${sha}/`, action: 'deploy' },
            });
            f.statuses.set(id, [{ state: 'success', created_at: '2026-10-01T00:00:00Z' }]);
        }
        if (late) {
            f.records.production!.push({
                id: 40,
                sha: f.root,
                created_at: '2026-10-09T01:00:00Z',
                payload: { image_ref: IMAGE, assets: `releases/${f.root}/`, action: 'rollback' },
            });
            f.statuses.set(40, [{ state: late, created_at: '2026-10-09T01:00:00Z' }]);
        }
        f.records.production!.sort((x, y) =>
            String(y.created_at).localeCompare(String(x.created_at)),
        );
        f.runs.set(90, {
            id: 90,
            workflow_id: 103,
            path: '.github/workflows/release-import.yml',
            event: 'workflow_dispatch',
            head_branch: 'main',
            head_sha: f.b,
            run_attempt: 1,
            repository: { full_name: REPO },
            head_repository: { full_name: REPO },
        });
        process.env.GITHUB_RUN_ID = '90';
        f.extra = (url) => {
            if (url.host === 'ghcr.io' && url.pathname.includes('/blobs/'))
                return Response.json({
                    config: {
                        Labels: {
                            'org.opencontainers.image.revision': f.releases.length ? f.a : f.b,
                        },
                    },
                });
        };
        await importReleases();
        expect(f.releases.map((row) => row.tag_name).toSorted()).toEqual(
            [`release-${f.a}`, `release-${f.b}`].toSorted(),
        );
        for (const row of f.releases) {
            const manifest = manifestOf(row);
            expect(manifest.publication_run).toBe(`https://github.com/${REPO}/actions/runs/90`);
            expect(manifest.ci_run).not.toBe(manifest.publication_run);
            expect(manifest.notification).toEqual(notification(1));
            expect(manifest.ci_run_attempt).toBe(1);
        }
        // повторный импорт ничего не меняет
        const count = f.releases.length;
        await importReleases();
        expect(f.releases).toHaveLength(count);
    },
);

test('импорт без исходной попытки в release-artifacts останавливается', async () => {
    f.legacy(f.b, 7);
    delete (f.records['release-artifacts']![0]!.payload as { notification?: unknown }).notification;
    f.records.production!.push({
        id: 30,
        sha: f.b,
        created_at: '2026-10-01T01:00:00Z',
        payload: { image_ref: IMAGE, assets: `releases/${f.b}/`, action: 'deploy' },
    });
    f.statuses.set(30, [{ state: 'success', created_at: '2026-10-01T00:00:00Z' }]);
    await expect(importReleases()).rejects.toThrow('исходной попытки');
    expect(f.releases).toHaveLength(0);
});

test('config digest из manifest.json docker save: классический и OCI формат', () => {
    const hex = 'c'.repeat(64);
    expect(configDigestOf(`${hex}.json`)).toBe(`sha256:${hex}`);
    expect(configDigestOf(`blobs/sha256/${hex}`)).toBe(`sha256:${hex}`);
    expect(configDigestOf(`${'d'.repeat(64)}.json`)).not.toBe(`sha256:${hex}`);
    expect(configDigestOf('config.json')).toBeUndefined();
    expect(configDigestOf(undefined)).toBeUndefined();
});

test('общая fixture producer/consumer проходит проверку', async () => {
    const shared = JSON.parse(
        readFileSync(new URL('./test/release-contract.json', import.meta.url), 'utf8'),
    ) as { manifest: unknown; sums: string };
    const manifest = releases.checkManifest(
        shared.manifest,
        (shared.manifest as { sha: string }).sha,
    );
    expect(manifest.publication_run).toBe(manifest.ci_run);
    expect(Object.keys(releases.parseSums(shared.sums))).toEqual([
        'frontend-dist.tar.gz',
        'bff-image.tar.gz',
        'release.json',
    ]);
    expect(releases.renderSums(releases.parseSums(shared.sums))).toBe(shared.sums);
});
