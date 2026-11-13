import { ReleaseError, checkSha, need } from './env.ts';
import { api, graphql } from './github.ts';

/** Задача с закрывающими связями; актуальное состояние проверяет board. */
export interface LinkedIssue {
    id: string;
    number: number;
    title: string;
    repo: string;
    prNumbers: number[];
}
/** Проверенный источник записи Deployment. */
export interface TrustedRun {
    id: number;
    kind: 'publish' | 'deploy' | 'rollback' | 'import';
    sha: string;
    url: string;
    /** Последняя попытка run */
    attempt: number;
}

/**
 * Читает run и проверяет repository, событие, ветку `main` и workflow ID/path; conclusion
 * готовность выпуска не определяет.
 */
export async function readTrustedRun(id: number): Promise<TrustedRun> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ReleaseError('Некорректный run ID');
    const run = await api<{
        workflow_id: number;
        path: string;
        event: string;
        head_branch: string;
        head_sha: string;
        run_attempt: number;
        repository: { full_name: string };
        head_repository: { full_name: string };
    }>(`/actions/runs/${id}`);
    const entry = [
        ['ci.yml', 'push', 'publish'],
        ['cd.yml', 'workflow_dispatch', 'deploy'],
        ['rollback.yml', 'workflow_dispatch', 'rollback'],
        // разовый перенос выпусков в Releases (docs/release.md, «Импорт»)
        ['release-import.yml', 'workflow_dispatch', 'import'],
    ].find(([file, event]) => run.path === `.github/workflows/${file}` && run.event === event);
    if (
        !entry ||
        run.head_branch !== 'main' ||
        run.repository?.full_name !== need('GITHUB_REPOSITORY') ||
        run.head_repository?.full_name !== need('GITHUB_REPOSITORY') ||
        !Number.isSafeInteger(run.run_attempt) ||
        run.run_attempt <= 0
    )
        throw new ReleaseError(`Недоверенный источник run ${id}`);
    const workflow = await api<{ id: number }>(`/actions/workflows/${entry[0]}`);
    if (run.workflow_id !== workflow.id)
        throw new ReleaseError(`Недоверенный workflow ID run ${id}`);
    return {
        id,
        kind: entry[2] as TrustedRun['kind'],
        sha: checkSha(run.head_sha),
        attempt: run.run_attempt,
        url: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${need('GITHUB_REPOSITORY')}/actions/runs/${id}`,
    };
}

/** Закрывающие связи конкретного PR, со всеми страницами. */
export async function linkedIssues(number: number): Promise<LinkedIssue[]> {
    const [owner, name] = need('GITHUB_REPOSITORY').split('/');
    const result: LinkedIssue[] = [];
    const seen = new Set<string>();
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
        const connection = data.repository?.pullRequest?.closingIssuesReferences;
        if (
            !Array.isArray(connection?.nodes) ||
            typeof connection.pageInfo?.hasNextPage !== 'boolean'
        )
            throw new ReleaseError('Неполные closingIssuesReferences');
        for (const issue of connection.nodes) {
            if (
                !issue?.id ||
                !Number.isSafeInteger(issue.number) ||
                issue.number <= 0 ||
                typeof issue.title !== 'string' ||
                !issue.repository?.nameWithOwner
            )
                throw new ReleaseError('Некорректная связанная issue');
            result.push({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                repo: issue.repository.nameWithOwner,
                prNumbers: [number],
            });
        }
        cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
        if (connection.pageInfo.hasNextPage && (!cursor || seen.has(cursor)))
            throw new ReleaseError('Нет нового курсора closingIssuesReferences');
        if (cursor) seen.add(cursor);
    } while (cursor);
    return result;
}

/** Все штатно связанные merged PR этой issue в default branch frontend, со всеми страницами. */
export async function mergedIssuePullRequests(
    issueId: string,
): Promise<{ number: number; mergeSha: string; mergedAt: string }[]> {
    const repo = need('GITHUB_REPOSITORY');
    const result: { number: number; mergeSha: string; mergedAt: string }[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
        const data: {
            node: {
                repository: { nameWithOwner: string; defaultBranchRef: { name: string } };
                closedByPullRequestsReferences: {
                    nodes: {
                        number: number;
                        merged: boolean;
                        mergedAt: string | null;
                        mergeCommit: { oid: string } | null;
                        baseRefName: string;
                        repository: {
                            nameWithOwner: string;
                            defaultBranchRef: { name: string } | null;
                        };
                    }[];
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                };
            };
        } = await graphql(
            `
                query MergedIssuePullRequests($id: ID!, $cursor: String) {
                    node(id: $id) {
                        ... on Issue {
                            repository {
                                nameWithOwner
                                defaultBranchRef {
                                    name
                                }
                            }
                            closedByPullRequestsReferences(
                                first: 100
                                after: $cursor
                                includeClosedPrs: true
                            ) {
                                nodes {
                                    number
                                    merged
                                    mergedAt
                                    mergeCommit {
                                        oid
                                    }
                                    baseRefName
                                    repository {
                                        nameWithOwner
                                        defaultBranchRef {
                                            name
                                        }
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
            { id: issueId, cursor },
            need('GITHUB_TOKEN'),
        );
        if (
            data.node?.repository?.nameWithOwner !== repo ||
            !data.node.repository.defaultBranchRef?.name
        )
            throw new ReleaseError('Некорректный репозиторий связанной issue');
        const connection = data.node.closedByPullRequestsReferences;
        if (
            !Array.isArray(connection?.nodes) ||
            typeof connection.pageInfo?.hasNextPage !== 'boolean'
        )
            throw new ReleaseError('Неполные связанные PR');
        for (const pr of connection.nodes) {
            if (
                !pr ||
                typeof pr.merged !== 'boolean' ||
                !pr.repository?.nameWithOwner ||
                !pr.baseRefName
            )
                throw new ReleaseError('Некорректный связанный PR');
            if (
                !pr.merged ||
                pr.repository.nameWithOwner !== repo ||
                pr.baseRefName !== data.node.repository.defaultBranchRef.name
            )
                continue;
            if (
                !Number.isSafeInteger(pr.number) ||
                pr.number <= 0 ||
                !pr.mergedAt ||
                !Number.isFinite(Date.parse(pr.mergedAt)) ||
                !pr.mergeCommit
            )
                throw new ReleaseError('Неполный merged PR');
            result.push({
                number: pr.number,
                mergeSha: checkSha(pr.mergeCommit.oid),
                mergedAt: pr.mergedAt,
            });
        }
        cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
        if (connection.pageInfo.hasNextPage && (!cursor || seen.has(cursor)))
            throw new ReleaseError('Связанные PR: нет нового курсора');
        if (cursor) seen.add(cursor);
    } while (cursor);
    return result;
}
