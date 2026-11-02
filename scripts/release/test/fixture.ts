import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Репозиторий для изолированных release-тестов. */
export const REPO = 'Cringe-Driven-Development-Team/frontend';
/** Публичный образ тестового выпуска. */
export const IMAGE = `ghcr.io/cringe-driven-development-team/bff@sha256:${'a'.repeat(64)}`;

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
    writeFileSync(join(dir, '.github/workflows/release-status.yml'), 'name: Release status\n');
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
    const publish = (sha = b, id = 1, time = '2026-11-01T02:00:00Z') => {
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
        runs.set(id, {
            id,
            workflow_id: 100,
            path: '.github/workflows/ci.yml',
            event: 'push',
            head_branch: 'main',
            head_sha: sha,
            conclusion: 'failure',
            repository: { full_name: REPO },
            head_repository: { full_name: REPO },
            html_url: `https://github.com/${REPO}/actions/runs/${id}`,
        });
        return row;
    };
    const deploy = (sha = a, id = 20) => {
        if (!records['release-artifacts']!.some((row) => row.sha === sha))
            publish(sha, id + 100, '2026-11-01T01:00:00Z');
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
        publish,
        deploy,
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
        const body = init?.body
            ? (JSON.parse(String(init.body)) as Record<string, unknown>)
            : undefined;
        requests.push({ url, body, init });
        const extra = await data.extra?.(url, body, init);
        if (extra) return extra;
        const path = url.pathname.replace(`/repos/${REPO}`, '');
        const page = Number(url.searchParams.get('page') ?? 1);
        const size = Number(url.searchParams.get('per_page') ?? 100);
        const slice = (rows: unknown[]) =>
            Response.json(rows.slice((page - 1) * size, page * size));
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
                id: path.endsWith('ci.yml') ? 100 : path.endsWith('cd.yml') ? 101 : 102,
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
