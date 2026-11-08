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
