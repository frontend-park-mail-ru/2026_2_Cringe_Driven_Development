import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, type GitHubRelease } from '../releases.ts';
import type { ProductionPayload } from '../github.ts';

/** Repository used by the HTTP fixture. */
export const REPO = 'Cringe-Driven-Development-Team/frontend';
const json = (value: unknown) => Response.json(value);
const page = (nodes: unknown[]) => ({
    nodes,
    pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null },
});

/** Isolated Git history and strict in-memory GitHub HTTP boundary; never uses the network. */
export function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'release-board-'));
    const git = (...args: string[]) => {
        const result = Bun.spawnSync(['git', ...args], { cwd: dir });
        if (result.exitCode) throw Error(result.stderr.toString());
        return result.stdout.toString().trim();
    };
    git('init', '-b', 'main');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.test');
    const commit = (name: string) => {
        git('commit', '--allow-empty', '-m', name);
        return git('rev-parse', 'HEAD');
    };
    const root = commit('root');
    const a = commit('a');
    const b = commit('b');
    const c = commit('c');
    const env = { ...process.env };
    const originalFetch = globalThis.fetch;
    Object.assign(process.env, {
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'repo-token',
        ADD_TO_PROJECT_PAT: 'project-token',
        GITHUB_API_URL: 'https://fixture.test',
        GITHUB_GRAPHQL_URL: 'https://fixture.test/graphql',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_RUN_ID: '1',
        GITHUB_RUN_ATTEMPT: '1',
    });
    const mergedAt = '2026-11-01T01:00:00Z';
    const now = '2026-11-01T04:00:00Z';
    const issues = new Map(
        [1, 2, 3].map((number) => [
            number,
            {
                number,
                id: `I${number}`,
                title: `Issue ${number}`,
                state: 'open',
                state_reason: null as string | null,
                events: [] as { kind: string; createdAt: string; closer?: null }[],
                card: { id: `C${number}`, status: 'Ready for build', updatedAt: mergedAt },
                prs: [number],
            },
        ]),
    );
    const prs = new Map(
        [1, 2, 3].map((number) => [
            number,
            {
                number,
                title: `PR ${number}`,
                merged: true,
                mergedAt,
                mergeCommit: { oid: number === 1 ? a : b },
                baseRefName: 'main',
                repository: { nameWithOwner: REPO, defaultBranchRef: { name: 'main' } },
            },
        ]),
    );
    const writes: { kind: string; issue: number; status?: string }[] = [];
    const releases = new Map<string, GitHubRelease>();
    const assets = new Map<number, string>();
    const deployments: {
        id: number;
        sha: string;
        environment: string;
        task: string;
        created_at: string;
        payload: ProductionPayload;
        state: string;
    }[] = [];
    let assetId = 1;
    const f = {
        dir,
        root,
        a,
        b,
        c,
        git,
        issues,
        prs,
        writes,
        releases,
        deployments,
        main: c,
        extra: undefined as
            | ((
                  url: URL,
                  body: any,
                  init?: RequestInit,
              ) => Response | undefined | Promise<Response | undefined>)
            | undefined,
        publish(sha = b, base = root) {
            const runId = releases.size + 1;
            const manifest = JSON.stringify({
                sha,
                image_ref: `ghcr.io/cringe-driven-development-team/bff@sha256:${'a'.repeat(64)}`,
                image_id: `sha256:${'b'.repeat(64)}`,
                assets: `releases/${sha}/`,
                ci_run: `https://github.com/${REPO}/actions/runs/${runId}`,
                ci_run_attempt: 1,
                publication_run: `https://github.com/${REPO}/actions/runs/${runId}`,
                notification: { base_sha: base, report_url: null, run_attempt: 1 },
            });
            const files: Record<string, string> = {
                'frontend-dist.tar.gz': 'dist',
                'bff-image.tar.gz': 'image',
                'release.json': manifest,
            };
            files.SHA256SUMS = Object.entries(files)
                .map(([name, content]) => `${sha256(content)}  ${name}\n`)
                .join('');
            const release: GitHubRelease = {
                id: releases.size + 1,
                tag_name: `release-${sha}`,
                target_commitish: sha,
                draft: false,
                prerelease: false,
                immutable: true,
                html_url: '',
                upload_url: '',
                assets: Object.entries(files).map(([name, content]) => {
                    const id = assetId++;
                    assets.set(id, content);
                    return {
                        id,
                        name,
                        size: content.length,
                        state: 'uploaded',
                        digest: `sha256:${sha256(content)}`,
                    };
                }),
            };
            releases.set(sha, release);
            return release;
        },
        production(
            action: 'deploy' | 'rollback' = 'deploy',
            sha = b,
            base = root,
            state = 'success',
        ) {
            const release = releases.get(sha) ?? f.publish(sha, base);
            const id = deployments.length + 1;
            deployments.unshift({
                id,
                sha,
                environment: 'production',
                task: action,
                created_at: `2026-11-01T0${id + 2}:00:00Z`,
                state,
                payload: {
                    action,
                    image_ref: `ghcr.io/cringe-driven-development-team/bff@sha256:${'a'.repeat(64)}`,
                    assets: `releases/${sha}/`,
                    run: `https://github.com/${REPO}/actions/runs/${100 + id}`,
                    release_id: release.id,
                    notification: { base_sha: base, report_url: null, run_attempt: 1 },
                },
            });
            return id;
        },
        restore() {
            globalThis.fetch = originalFetch;
            for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
            Object.assign(process.env, env);
            rmSync(dir, { recursive: true, force: true });
        },
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        const extra = await f.extra?.(url, body, init);
        if (extra) return extra;
        const path = url.pathname.replace(`/repos/${REPO}`, '');
        if (path === '') return json({ full_name: REPO, default_branch: 'main' });
        if (path === '/branches/main') return json({ name: 'main', commit: { sha: f.main } });
        if (path.startsWith('/compare/')) {
            const [base, head] = path.slice(9).split('...') as [string, string];
            const forward =
                Bun.spawnSync(['git', 'merge-base', '--is-ancestor', base, head], { cwd: dir })
                    .exitCode === 0;
            const reverse =
                Bun.spawnSync(['git', 'merge-base', '--is-ancestor', head, base], { cwd: dir })
                    .exitCode === 0;
            const commits = git('rev-list', `${base}..${head}`)
                .split('\n')
                .filter(Boolean)
                .map((sha) => ({ sha }));
            return json({
                status:
                    base === head
                        ? 'identical'
                        : forward
                          ? 'ahead'
                          : reverse
                            ? 'behind'
                            : 'diverged',
                base_commit: { sha: base },
                merge_base_commit: { sha: forward ? base : head },
                total_commits: commits.length,
                commits,
            });
        }
        if (/^\/commits\/[^/]+\/pulls$/.test(path))
            return json(
                [...prs.values()]
                    .filter((pr) => pr.mergeCommit.oid === path.split('/')[2])
                    .map((pr) => ({
                        number: pr.number,
                        title: pr.title,
                        merged_at: pr.mergedAt,
                        merge_commit_sha: pr.mergeCommit.oid,
                    })),
            );
        if (path.startsWith('/git/ref/tags/release-'))
            return json({
                object: { type: 'commit', sha: path.slice('/git/ref/tags/release-'.length) },
            });
        if (path === '/releases') return json([...releases.values()]);
        if (path.startsWith('/releases/tags/release-'))
            return json(releases.get(path.slice('/releases/tags/release-'.length)));
        if (path.startsWith('/releases/assets/'))
            return new Response(assets.get(Number(path.split('/').at(-1))));
        if (path.startsWith('/actions/workflows/'))
            return json({ id: path.endsWith('ci.yml') ? 1 : path.endsWith('cd.yml') ? 2 : 3 });
        if (path.startsWith('/actions/runs/')) {
            const id = Number(path.split('/').at(-1));
            const deployment = deployments.find((item) => item.id === id - 100);
            const kind = deployment?.task;
            return json({
                workflow_id: !kind ? 1 : kind === 'deploy' ? 2 : 3,
                path: `.github/workflows/${!kind ? 'ci' : kind === 'deploy' ? 'cd' : 'rollback'}.yml`,
                event: kind ? 'workflow_dispatch' : 'push',
                head_branch: 'main',
                head_sha: kind
                    ? f.main
                    : [...releases.values()].find((release) => release.id === id)?.target_commitish,
                run_attempt: 1,
                repository: { full_name: REPO },
                head_repository: { full_name: REPO },
            });
        }
        if (path === '/deployments')
            return json(
                deployments.filter(
                    (item) =>
                        !url.searchParams.has('sha') || item.sha === url.searchParams.get('sha'),
                ),
            );
        if (/^\/deployments\/\d+(\/statuses)?$/.test(path)) {
            const item = deployments.find((row) => row.id === Number(path.split('/')[2]));
            return json(
                path.endsWith('/statuses')
                    ? [
                          {
                              state: item?.state,
                              created_at: item?.created_at,
                              description: 'health verified',
                          },
                      ]
                    : item,
            );
        }
        if (path.startsWith('/issues/')) {
            const issue = issues.get(Number(path.split('/').at(-1)))!;
            if (init?.method === 'PATCH') {
                if (
                    init.headers &&
                    (init.headers as Record<string, string>).Authorization !== 'Bearer repo-token'
                )
                    throw Error('Wrong issue token');
                issue.state = body.state;
                issue.state_reason = body.state_reason;
                issue.events.push({
                    kind: body.state === 'closed' ? 'ClosedEvent' : 'ReopenedEvent',
                    createdAt: now,
                    closer: null,
                });
                writes.push({
                    kind: body.state === 'closed' ? 'close' : 'reopen',
                    issue: issue.number,
                });
            }
            return json(issue);
        }
        if (path === '/graphql') {
            const query = String(body.query);
            const v = body.variables;
            const issue = issues.get(Number(String(v.id).slice(1)));
            if (query.includes('LinkedIssues'))
                return json({
                    data: {
                        repository: {
                            pullRequest: {
                                closingIssuesReferences: page(
                                    [...issues.values()]
                                        .filter((item) => item.prs.includes(v.number))
                                        .map((item) => ({
                                            id: item.id,
                                            number: item.number,
                                            title: item.title,
                                            repository: { nameWithOwner: REPO },
                                        })),
                                ),
                            },
                        },
                    },
                });
            if (query.includes('MergedIssuePullRequests'))
                return json({
                    data: {
                        node: {
                            repository: { nameWithOwner: REPO, defaultBranchRef: { name: 'main' } },
                            closedByPullRequestsReferences: page(
                                issue!.prs.map((number) => prs.get(number)),
                            ),
                        },
                    },
                });
            if (query.includes('ReleaseProject'))
                return json({
                    data: {
                        organization: {
                            projectV2: {
                                id: 'P',
                                viewerCanUpdate: true,
                                fields: page([
                                    {
                                        id: 'F',
                                        name: 'Status',
                                        options: [
                                            'Ready for release',
                                            'Done',
                                            'Rollback from production',
                                        ].map((name) => ({ id: name, name })),
                                    },
                                ]),
                            },
                        },
                    },
                });
            if (query.includes('BoardIssue'))
                return json({
                    data: {
                        node: {
                            number: issue!.number,
                            closed: issue!.state === 'closed',
                            title: issue!.title,
                            stateReason: issue!.state_reason?.toUpperCase() ?? null,
                            repository: { nameWithOwner: REPO },
                            timelineItems: page(issue!.events),
                        },
                    },
                });
            if (query.includes('BoardCard'))
                return json({
                    data: {
                        node: {
                            projectItems: page([
                                {
                                    id: issue!.card.id,
                                    project: { id: 'P' },
                                    fieldValueByName: {
                                        name: issue!.card.status,
                                        updatedAt: issue!.card.updatedAt,
                                    },
                                },
                            ]),
                        },
                    },
                });
            if (query.includes('UpdateReleaseStatus')) {
                if (
                    (init?.headers as Record<string, string> | undefined)?.Authorization !==
                    'Bearer project-token'
                )
                    throw Error('Wrong project token');
                const item = issues.get(Number(v.item.slice(1)))!;
                item.card.status = v.option;
                item.card.updatedAt = now;
                writes.push({ kind: 'status', issue: item.number, status: v.option });
                return json({
                    data: {
                        updateProjectV2ItemFieldValue: { projectV2Item: { id: v.item } },
                        ...(v.reset
                            ? { clearProjectV2ItemFieldValue: { projectV2Item: { id: v.item } } }
                            : {}),
                    },
                });
            }
        }
        throw Error(
            `Unexpected fixture request ${init?.method ?? 'GET'} ${url} ${body?.query ?? ''}`,
        );
    }) as typeof fetch;
    return f;
}
