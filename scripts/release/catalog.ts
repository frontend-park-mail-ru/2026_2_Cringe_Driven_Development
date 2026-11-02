import { ReleaseError, checkSha, need } from './env.ts';
import { assetsOf, readyArtifacts } from './deployments.ts';
import {
    api,
    graphql,
    listDeployments,
    listDeploymentRecords,
    type Deployment,
    type DeploymentState,
    listDeploymentStatuses,
    type ArtifactsPayload,
    type ProductionPayload,
} from './github.ts';
import { checkImageRef } from './image.ts';

/** PR, факт мержа которого проверяется по графу Git. */
export interface MergedPR {
    number: number;
    url: string;
    mergeSha: string;
}
/** Задача с закрывающими связями; актуальное состояние проверяет board. */
export interface LinkedIssue {
    id: string;
    number: number;
    title: string;
    repo: string;
    prNumbers: number[];
}
/** Успешный выпуск и полный состав PR. */
export interface PublishedRelease {
    id: number;
    sha: string;
    imageRef: string;
    ciRun: string;
    readyAt: string;
    prNumbers: number[];
}
/** Снимок публикаций и всех когда-либо успешных выкаток. */
export interface ReleaseSnapshot {
    published: PublishedRelease[];
    deployed: Set<number>;
    deployedShas: string[];
    prs: Map<number, MergedPR>;
    issues: LinkedIssue[];
}
/** Проверенный источник записи Deployment. */
export interface TrustedRun {
    id: number;
    kind: 'publish' | 'deploy' | 'rollback';
    sha: string;
    url: string;
}

async function git(repoDir: string, ...args: string[]): Promise<string> {
    const proc = Bun.spawn(['git', ...args], { cwd: repoDir, stdout: 'pipe', stderr: 'pipe' });
    const [out, err, status] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (status) throw new ReleaseError(`Git: ${err.trim()}`);
    return out.trim();
}

/** Проверка repository, события и workflow ID/path; conclusion не определяет готовность выпуска. */
export async function readTrustedRun(id: number): Promise<TrustedRun> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ReleaseError('Некорректный run ID');
    const run = await api<{
        workflow_id: number;
        path: string;
        event: string;
        head_branch: string;
        head_sha: string;
        repository: { full_name: string };
        head_repository: { full_name: string };
    }>(`/actions/runs/${id}`);
    const entry = [
        ['ci.yml', 'push', 'publish'],
        ['cd.yml', 'workflow_dispatch', 'deploy'],
        ['rollback.yml', 'workflow_dispatch', 'rollback'],
    ].find(([file, event]) => run.path === `.github/workflows/${file}` && run.event === event);
    if (
        !entry ||
        run.head_branch !== 'main' ||
        run.repository?.full_name !== need('GITHUB_REPOSITORY') ||
        run.head_repository?.full_name !== need('GITHUB_REPOSITORY')
    )
        throw new ReleaseError(`Недоверенный источник run ${id}`);
    const workflow = await api<{ id: number }>(`/actions/workflows/${entry[0]}`);
    if (run.workflow_id !== workflow.id)
        throw new ReleaseError(`Недоверенный workflow ID run ${id}`);
    return {
        id,
        kind: entry[2] as TrustedRun['kind'],
        sha: checkSha(run.head_sha),
        url: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${need('GITHUB_REPOSITORY')}/actions/runs/${id}`,
    };
}

function runId(value: unknown): number {
    if (typeof value !== 'string') throw new ReleaseError('Нет URL исходного run');
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new ReleaseError('Некорректный URL исходного run');
    }
    const server = new URL(process.env.GITHUB_SERVER_URL || 'https://github.com');
    const prefix = `/${need('GITHUB_REPOSITORY')}/actions/runs/`;
    if (
        url.origin !== server.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(prefix) ||
        !/^[1-9][0-9]*$/.test(url.pathname.slice(prefix.length))
    )
        throw new ReleaseError('URL исходного run вне доверенного репозитория');
    return Number(url.pathname.slice(prefix.length));
}

/** Закрывающие связи конкретного PR, со всеми страницами. */
export async function linkedIssues(number: number): Promise<LinkedIssue[]> {
    const [owner, name] = need('GITHUB_REPOSITORY').split('/');
    const result: LinkedIssue[] = [];
    let cursor: string | null = null;
    do {
        const data: {
            repository: {
                pullRequest: {
                    closingIssuesReferences: {
                        nodes: {
                            id: string;
                            number: number;
                            title: string;
                            repository: { nameWithOwner: string };
                        }[];
                        pageInfo: { hasNextPage: boolean; endCursor: string | null };
                    };
                };
            };
        } = await graphql(
            `
                query LinkedIssues(
                    $owner: String!
                    $name: String!
                    $number: Int!
                    $cursor: String
                ) {
                    repository(owner: $owner, name: $name) {
                        pullRequest(number: $number) {
                            closingIssuesReferences(first: 100, after: $cursor) {
                                nodes {
                                    id
                                    number
                                    title
                                    repository {
                                        nameWithOwner
                                    }
                                }
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                            }
                        }
                    }
                }
            `,
            { owner, name, number, cursor },
            need('GITHUB_TOKEN'),
        );
        const connection = data.repository.pullRequest.closingIssuesReferences;
        for (const issue of connection.nodes)
            result.push({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                repo: issue.repository.nameWithOwner,
                prNumbers: [number],
            });
        cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
        if (connection.pageInfo.hasNextPage && !cursor)
            throw new ReleaseError('Нет курсора closingIssuesReferences');
    } while (cursor);
    return result;
}

async function mergedPRs(): Promise<(MergedPR & { title: string })[]> {
    const prs: (MergedPR & { title: string })[] = [];
    for (let page = 1; ; page++) {
        const rows = await api<
            {
                number: number;
                html_url: string;
                title: string;
                merge_commit_sha: string | null;
                merged_at: string | null;
            }[]
        >(`/pulls?state=closed&per_page=100&page=${page}`);
        for (const row of rows)
            if (row.merged_at && row.merge_commit_sha) {
                if (!Number.isSafeInteger(row.number) || row.number <= 0)
                    throw new ReleaseError('Некорректный номер PR');
                if (typeof row.title !== 'string') throw new ReleaseError('Нет названия PR');
                prs.push({
                    title: row.title,
                    number: row.number,
                    url: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${need('GITHUB_REPOSITORY')}/pull/${row.number}`,
                    mergeSha: row.merge_commit_sha,
                });
            }
        if (rows.length < 100) break;
    }
    return prs;
}

async function issuesForPRs(numbers: number[]): Promise<LinkedIssue[]> {
    const issues = new Map<string, LinkedIssue>();
    for (const number of numbers)
        for (const issue of await linkedIssues(number)) {
            const old = issues.get(issue.id);
            if (old) old.prNumbers.push(number);
            else issues.set(issue.id, issue);
        }
    return [...issues.values()];
}

/** Каталог публикаций и выкаток без закрывающих связей задач. */
export type ReleaseCatalog = Omit<ReleaseSnapshot, 'issues'>;

/** Проверенные публикации, PR и выкатки без обращения к issues/Project API. */
export async function readReleaseCatalog(repoDir: string): Promise<ReleaseCatalog> {
    const main = new Set((await git(repoDir, 'rev-list', 'origin/main')).split('\n'));
    const [artifacts, rawProduction] = await Promise.all([
        listDeployments<ArtifactsPayload>('release-artifacts'),
        listDeploymentRecords<ProductionPayload>('production'),
    ]);
    const production: Deployment<ProductionPayload>[] = [];
    for (const record of rawProduction) {
        const payload = record.payload;
        if (!payload?.action && !payload?.run && !payload?.image_ref) continue;
        const statuses = await api<{ state: DeploymentState }[]>(
            `/deployments/${record.id}/statuses?per_page=1`,
        );
        production.push({ ...record, state: statuses[0]?.state });
    }
    const prs = new Map<number, MergedPR>(
        (await mergedPRs()).filter((pr) => main.has(pr.mergeSha)).map((pr) => [pr.number, pr]),
    );
    const members = async (sha: string) => {
        if (!main.has(checkSha(sha))) throw new ReleaseError(`Выпуск ${sha} не входит в main`);
        const ancestors = new Set((await git(repoDir, 'rev-list', sha)).split('\n'));
        return [...prs.values()]
            .filter((pr) => ancestors.has(pr.mergeSha))
            .map((pr) => pr.number)
            .toSorted((a, b) => a - b);
    };
    const trusted = new Map<number, TrustedRun>();
    const source = async (url: unknown) => {
        const id = runId(url);
        if (!trusted.has(id)) trusted.set(id, await readTrustedRun(id));
        return trusted.get(id)!;
    };
    const published: PublishedRelease[] = [];
    for (const sha of new Set(
        artifacts.filter((record) => record.state === 'success').map((record) => record.sha),
    )) {
        const payload = readyArtifacts(artifacts, sha)!;
        const candidates = [];
        for (const record of artifacts.filter(
            (candidate) => candidate.sha === sha && candidate.state === 'success',
        )) {
            const run = await source(record.payload.ci_run);
            if (run.kind !== 'publish' || run.sha !== sha)
                throw new ReleaseError(`Выпуск ${sha}: неподходящий CI run`);
            const times = (await listDeploymentStatuses(record.id))
                .filter((status) => status.state === 'success')
                .map((status) => status.createdAt)
                .toSorted();
            if (!times[0]) throw new ReleaseError(`Нет успешного статуса выпуска ${sha}`);
            candidates.push({ id: record.id, time: times[0], run: run.url });
        }
        const first = candidates.toSorted(
            (a, b) => Date.parse(a.time) - Date.parse(b.time) || a.id - b.id,
        )[0]!;
        published.push({
            id: first.id,
            sha,
            imageRef: payload.image_ref,
            ciRun: first.run,
            readyAt: first.time,
            prNumbers: await members(sha),
        });
    }
    const deployed = new Set<number>();
    const deployedShas: string[] = [];
    for (const record of production.filter((candidate) => candidate.state === 'success')) {
        const payload = record.payload;
        const run = await source(payload?.run);
        const ready = published.find((release) => release.sha === record.sha);
        if (
            !payload ||
            !['deploy', 'rollback'].includes(payload.action) ||
            run.kind !== payload.action ||
            payload.assets !== assetsOf(record.sha) ||
            !ready ||
            checkImageRef(payload.image_ref) !== ready.imageRef
        )
            throw new ReleaseError(`Некорректный production Deployment ${record.id}`);
        for (const number of await members(record.sha)) deployed.add(number);
        if (!deployedShas.includes(record.sha)) deployedShas.push(record.sha);
    }
    return {
        published: published.toSorted(
            (a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt) || a.id - b.id,
        ),
        deployed,
        deployedShas,
        prs,
    };
}

/** Полный состав с закрывающими связями задач для синхронизации доски. */
export async function readReleaseSnapshot(repoDir: string): Promise<ReleaseSnapshot> {
    const catalog = await readReleaseCatalog(repoDir);
    const included = new Set(catalog.published.flatMap((release) => release.prNumbers));
    return { ...catalog, issues: await issuesForPRs([...included]) };
}
