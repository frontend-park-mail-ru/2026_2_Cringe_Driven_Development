import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Репозиторий для изолированных release-тестов. */
export const REPO = 'Cringe-Driven-Development-Team/frontend';
/** Публичный образ тестового выпуска. */
export const IMAGE = `ghcr.io/cringe-driven-development-team/bff@sha256:${'a'.repeat(64)}`;
/** Config digest (image ID) тестового образа. */
export const IMAGE_ID = `sha256:${'c'.repeat(64)}`;

const hex = (data: Uint8Array | string) =>
    new Bun.CryptoHasher('sha256').update(data).digest('hex');
const runUrl = (id: number) => `https://github.com/${REPO}/actions/runs/${id}`;

/** Release в форме GitHub API; assets ссылаются на байты в blobs. */
export interface FixtureRelease {
    id: number;
    tag_name: string;
    target_commitish: string;
    draft: boolean;
    prerelease: boolean;
    immutable: boolean;
    html_url: string;
    upload_url: string;
    assets: { id: number; name: string; size: number; state: string; digest: string | null }[];
}

/** Git без shell и без изменения глобальной конфигурации. */
export function git(dir: string, ...args: string[]): string {
    const result = Bun.spawnSync(['git', ...args], {
        cwd: dir,
        env: {
            ...process.env,
            GIT_AUTHOR_DATE: '2026-11-01T00:00:00Z',
            GIT_COMMITTER_DATE: '2026-11-01T00:00:00Z',
        },
    });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
}

/** Поддельный HTTP boundary; все Git-операции и release-функции остаются настоящими. */
export function fixture() {
    const env = { ...process.env };
    const realFetch = globalThis.fetch;
    const dir = mkdtempSync(join(tmpdir(), 'release-'));
    git(dir, 'init', '-b', 'main');
    git(dir, 'config', 'user.name', 'Release Test');
    git(dir, 'config', 'user.email', 'release@example.invalid');
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/ci.yml'), 'name: CI\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'root');
    const root = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', '-b', 'parent');
    git(dir, 'commit', '--allow-empty', '-m', 'parent');
    git(dir, 'checkout', 'main');
    git(dir, 'merge', '--no-ff', 'parent', '-m', 'merge parent');
    const a = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', '-b', 'child');
    git(dir, 'commit', '--allow-empty', '-m', 'child');
    git(dir, 'checkout', 'main');
    git(dir, 'merge', '--no-ff', 'child', '-m', 'merge child');
    const b = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', '-b', 'outside', root);
    git(dir, 'commit', '--allow-empty', '-m', 'outside');
    const outside = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', 'main');
    git(dir, 'update-ref', 'refs/remotes/origin/main', b);
    Object.assign(process.env, {
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'repo-token',
        ADD_TO_PROJECT_PAT: 'project-token',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_API_URL: 'https://api.github.com',
        GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql',
    });
    const records: Record<string, Record<string, unknown>[]> = {
        'release-artifacts': [],
        production: [],
        'release-automation': [],
    };
    const statuses = new Map<number, Record<string, unknown>[]>();
    const requests: {
        url: URL;
        body: Record<string, unknown> | undefined;
        init: RequestInit | undefined;
    }[] = [];
    const pulls = [a, b, outside].map((sha, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        html_url: `https://github.com/${REPO}/pull/${i + 1}`,
        merge_commit_sha: sha,
        merged_at: '2026-11-01T01:00:00Z',
        updated_at: '2026-11-01T01:00:00Z',
        base: { ref: i === 1 ? 'parent' : 'main' },
    }));
    const runs = new Map<number, Record<string, unknown>>();
    let nextId = 1000;
    const releases: FixtureRelease[] = [];
    const blobs = new Map<number, Uint8Array>();
    const tags = new Map<string, string>();
    const ciRun = (sha: string, id: number, attempt = 1) =>
        runs.set(id, {
            id,
            workflow_id: 100,
            path: '.github/workflows/ci.yml',
            event: 'push',
            head_branch: 'main',
            head_sha: sha,
            run_attempt: attempt,
            conclusion: 'failure',
            repository: { full_name: REPO },
            head_repository: { full_name: REPO },
            html_url: runUrl(id),
        });
    const asset = (name: string, bytes: Uint8Array | string) => {
        const id = nextId++;
        const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
        blobs.set(id, data);
        return { id, name, size: data.length, state: 'uploaded', digest: `sha256:${hex(data)}` };
    };
    /** Опубликованный immutable Release с полным комплектом; источник — push/main CI run id. */
    const release = (
        sha: string,
        id: number,
        patch: { manifest?: Record<string, unknown>; release?: Partial<FixtureRelease> } = {},
    ) => {
        ciRun(sha, id);
        const manifest = {
            sha,
            image_ref: IMAGE,
            image_id: IMAGE_ID,
            assets: `releases/${sha}/`,
            ci_run: runUrl(id),
            ci_run_attempt: 1,
            publication_run: runUrl(id),
            notification: { base_sha: null, report_url: null, run_attempt: 1 },
            ...patch.manifest,
        };
        const files = [
            asset('frontend-dist.tar.gz', 'dist'),
            asset('bff-image.tar.gz', 'image'),
            asset('release.json', JSON.stringify(manifest)),
        ];
        const sums = files.map((file) => `${file.digest!.slice(7)}  ${file.name}\n`).join('');
        const row: FixtureRelease = {
            id: nextId++,
            tag_name: `release-${sha}`,
            target_commitish: sha,
            draft: false,
            prerelease: false,
            immutable: true,
            html_url: `https://github.com/${REPO}/releases/tag/release-${sha}`,
            upload_url: '',
            assets: [...files, asset('SHA256SUMS', sums)],
            ...patch.release,
        };
        row.upload_url = `https://uploads.github.com/repos/${REPO}/releases/${row.id}/assets{?name,label}`;
        if (!row.draft) tags.set(row.tag_name, sha);
        releases.unshift(row);
        return row;
    };
    /** Готовый выпуск: опубликованный Release. */
    const publish = (sha = b, id = 1) => release(sha, id);
    /** Запись прежнего каталога release-artifacts: источник разового импорта. */
    const legacy = (sha = b, id = 1, time = '2026-11-01T02:00:00Z') => {
        const row = {
            id,
            sha,
            created_at: time,
            payload: {
                image_ref: IMAGE,
                assets: `releases/${sha}/`,
                ci_run: `https://github.com/${REPO}/actions/runs/${id}`,
            },
        };
        records['release-artifacts']!.push(row);
        statuses.set(id, [{ state: 'success', created_at: time, description: 'ready' }]);
        ciRun(sha, id);
        return row;
    };
    const deploy = (sha = a, id = 20) => {
        if (!releases.some((row) => row.tag_name === `release-${sha}`)) publish(sha, id + 100);
        const row = {
            id,
            sha,
            created_at: '2026-11-01T03:00:00Z',
            payload: {
                image_ref: IMAGE,
                assets: `releases/${sha}/`,
                action: 'deploy',
                run: `https://github.com/${REPO}/actions/runs/${id}`,
            },
        };
        records.production!.push(row);
        statuses.set(id, [
            { state: 'success', created_at: row.created_at, description: 'healthy' },
        ]);
        runs.set(id, {
            id,
            workflow_id: 101,
            path: '.github/workflows/cd.yml',
            event: 'workflow_dispatch',
            head_branch: 'main',
            head_sha: b,
            run_attempt: 1,
            conclusion: 'failure',
            repository: { full_name: REPO },
            head_repository: { full_name: REPO },
            html_url: `https://github.com/${REPO}/actions/runs/${id}`,
        });
        return row;
    };
    const data = {
        dir,
        a,
        b,
        outside,
        root,
        records,
        statuses,
        requests,
        pulls,
        runs,
        releases,
        blobs,
        tags,
        release,
        publish,
        legacy,
        deploy,
        /** Метка revision образа в поддельном GHCR */
        imageRevision: b,
        /** Включена ли immutability: Release после publish становится immutable */
        immutableEnabled: true,
        extra: undefined as
            | undefined
            | ((
                  url: URL,
                  body: Record<string, unknown> | undefined,
                  init: RequestInit | undefined,
              ) => Response | Promise<Response> | undefined),
        restore() {
            globalThis.fetch = realFetch;
            for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
            Object.assign(process.env, env);
            rmSync(dir, { recursive: true, force: true });
        },
    };
    globalThis.fetch = (async (input, init) => {
        const url = new URL(String(input));
        const body =
            typeof init?.body === 'string'
                ? (JSON.parse(init.body) as Record<string, unknown>)
                : undefined;
        requests.push({ url, body, init });
        const extra = await data.extra?.(url, body, init);
        if (extra) return extra;
        const page = Number(url.searchParams.get('page') ?? 1);
        const size = Number(url.searchParams.get('per_page') ?? 100);
        const slice = (rows: unknown[]) =>
            Response.json(rows.slice((page - 1) * size, page * size));
        if (url.host === 'ghcr.io') {
            if (url.pathname === '/token') return Response.json({ token: 'anonymous' });
            if (url.pathname.includes('/manifests/'))
                return Response.json({
                    mediaType: 'application/vnd.oci.image.manifest.v1+json',
                    config: { digest: IMAGE_ID },
                });
            return Response.json({
                config: { Labels: { 'org.opencontainers.image.revision': data.imageRevision } },
            });
        }
        const path = url.pathname.replace(`/repos/${REPO}`, '');
        const method = init?.method ?? 'GET';
        const find = (id: string | undefined) => releases.find((row) => row.id === Number(id));
        if (path === '/releases' && method === 'POST') {
            const row: FixtureRelease = {
                id: nextId++,
                tag_name: String(body?.tag_name),
                target_commitish: String(body?.target_commitish),
                draft: body?.draft === true,
                prerelease: body?.prerelease === true,
                immutable: false,
                html_url: `https://github.com/${REPO}/releases/tag/${body?.tag_name}`,
                upload_url: '',
                assets: [],
            };
            row.upload_url = `https://uploads.github.com/repos/${REPO}/releases/${row.id}/assets{?name,label}`;
            releases.unshift(row);
            return Response.json(row, { status: 201 });
        }
        if (path === '/releases') return slice(releases);
        const byTag = /^\/releases\/tags\/(.+)$/.exec(path);
        if (byTag) {
            const row = releases.find((item) => item.tag_name === byTag[1] && !item.draft);
            return row ? Response.json(row) : Response.json({}, { status: 404 });
        }
        const assetPath = /^\/releases\/assets\/(\d+)$/.exec(path);
        if (assetPath) {
            const id = Number(assetPath[1]);
            if (method === 'DELETE') {
                for (const row of releases)
                    row.assets = row.assets.filter((item) => item.id !== id);
                blobs.delete(id);
                return new Response(null, { status: 204 });
            }
            const bytes = blobs.get(id);
            return bytes ? new Response(bytes) : Response.json({}, { status: 404 });
        }
        const upload = /^\/releases\/(\d+)\/assets$/.exec(path);
        if (upload && method === 'POST') {
            const row = find(upload[1])!;
            const name = url.searchParams.get('name')!;
            if (row.assets.some((item) => item.name === name))
                return Response.json({ message: 'already_exists' }, { status: 422 });
            const item = asset(name, new Uint8Array(await new Response(init?.body).arrayBuffer()));
            row.assets.push(item);
            return Response.json(item, { status: 201 });
        }
        const one = /^\/releases\/(\d+)$/.exec(path);
        if (one) {
            const row = find(one[1]);
            if (!row) return Response.json({}, { status: 404 });
            if (method === 'PATCH') {
                if (body?.body !== undefined) Object.assign(row, { body: body.body });
                if (body?.draft === false && row.draft) {
                    row.draft = false;
                    row.immutable = data.immutableEnabled;
                    tags.set(row.tag_name, row.target_commitish);
                }
            }
            return Response.json(row);
        }
        const tagRef = /^\/git\/ref\/tags\/(.+)$/.exec(path);
        if (tagRef) {
            const commit = tags.get(tagRef[1]!);
            return commit
                ? Response.json({ object: { sha: commit, type: 'commit' } })
                : Response.json({}, { status: 404 });
        }
        if (path === '/deployments' && init?.method === 'POST') {
            const row = {
                ...body,
                id: nextId++,
                sha: body?.ref,
                created_at: '2026-11-01T04:00:00Z',
            };
            const environment = String(body?.environment);
            (records[environment] ??= []).push(row);
            return Response.json(row);
        }
        if (path === '/deployments')
            return slice(
                (records[url.searchParams.get('environment') ?? ''] ?? []).filter(
                    (row) =>
                        !url.searchParams.has('sha') || row.sha === url.searchParams.get('sha'),
                ),
            );
        const match = /^\/deployments\/(\d+)\/statuses$/.exec(path);
        if (match) {
            const id = Number(match[1]);
            if (init?.method === 'POST') {
                statuses.set(id, [
                    { ...body, created_at: '2026-11-01T04:00:00Z' },
                    ...(statuses.get(id) ?? []),
                ]);
                return Response.json({});
            }
            return slice(statuses.get(id) ?? []);
        }
        if (path.startsWith('/compare/')) {
            const range = path.slice('/compare/'.length).replace('...', '..');
            const commits = git(dir, 'rev-list', '--reverse', range)
                .split('\n')
                .filter(Boolean)
                .map((sha) => ({ sha }));
            return Response.json({
                total_commits: commits.length,
                commits: commits.slice((page - 1) * size, page * size),
            });
        }
        const associated = /^\/commits\/([0-9a-f]{40})\/pulls$/.exec(path);
        if (associated) return slice(pulls.filter((pr) => pr.merge_commit_sha === associated[1]));
        if (path === '/pulls') return slice(pulls);
        if (path.startsWith('/actions/runs/'))
            return Response.json(runs.get(Number(path.split('/').at(-1))) ?? {}, {
                status: runs.has(Number(path.split('/').at(-1))) ? 200 : 404,
            });
        if (path.startsWith('/actions/workflows/'))
            return Response.json({
                id: path.endsWith('ci.yml')
                    ? 100
                    : path.endsWith('cd.yml')
                      ? 101
                      : path.endsWith('release-import.yml')
                        ? 103
                        : 102,
            });
        if (path === '/graphql') {
            const vars = body?.variables as { number?: number; cursor?: string };
            if (String(body?.query).includes('LinkedIssues'))
                return Response.json({
                    data: {
                        repository: {
                            pullRequest: {
                                closingIssuesReferences: {
                                    nodes: [
                                        {
                                            id: `I${vars.number}`,
                                            number: vars.number,
                                            title: `Frontend. ${vars.number}`,
                                            repository: { nameWithOwner: REPO },
                                        },
                                    ],
                                    pageInfo: { hasNextPage: false, endCursor: null },
                                },
                            },
                        },
                    },
                });
        }
        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    }) as typeof fetch;
    return data;
}
