import { afterEach, beforeEach, expect, test } from 'bun:test';
import { linkedIssues, readTrustedRun } from './catalog.ts';
import { graphql } from './github.ts';
import { fixture, REPO } from './test/fixture.ts';

let f: ReturnType<typeof fixture>;
beforeEach(() => {
    f = fixture();
});
afterEach(() => f.restore());

test('доверенный CI/CD определяется источником, а не общим conclusion', async () => {
    f.publish();
    f.deploy();
    expect((await readTrustedRun(1)).kind).toBe('publish');
    expect((await readTrustedRun(20)).kind).toBe('deploy');
    for (const patch of [
        { event: 'pull_request' },
        { head_branch: 'parent' },
        { head_repository: { full_name: 'evil/fork' } },
        { repository: { full_name: 'evil/repo' } },
        { workflow_id: 999 },
        { path: '.github/workflows/evil.yml' },
    ]) {
        const old = f.runs.get(1)!;
        f.runs.set(1, { ...old, ...patch });
        await expect(readTrustedRun(1)).rejects.toThrow();
        f.runs.set(1, old);
    }
});

test('GraphQL errors при HTTP 200 не становятся пустым результатом', async () => {
    f.extra = (url) =>
        url.pathname === '/graphql'
            ? Response.json({ errors: [{ message: 'denied' }] })
            : undefined;
    await expect(graphql('query X { viewer { login } }', {}, 'private-token')).rejects.toThrow(
        'GraphQL',
    );
});

test('closing links retain every page and PR association', async () => {
    f.extra = (url, body) => {
        if (url.pathname !== '/graphql') return;
        const vars = body?.variables as { number: number; cursor?: string };
        const second = Boolean(vars.cursor);
        return Response.json({
            data: {
                repository: {
                    pullRequest: {
                        closingIssuesReferences: {
                            nodes: [
                                {
                                    id: second ? 'I2' : 'I1',
                                    number: second ? 2 : 1,
                                    title: 'Issue',
                                    repository: { nameWithOwner: REPO },
                                },
                            ],
                            pageInfo: { hasNextPage: !second, endCursor: second ? null : 'next' },
                        },
                    },
                },
            },
        });
    };
    expect(await linkedIssues(7)).toEqual([
        { id: 'I1', number: 1, title: 'Issue', repo: REPO, prNumbers: [7] },
        { id: 'I2', number: 2, title: 'Issue', repo: REPO, prNumbers: [7] },
    ]);
});

test('missing closing-links cursor is an error instead of a partial report', async () => {
    f.extra = () =>
        Response.json({
            data: {
                repository: {
                    pullRequest: {
                        closingIssuesReferences: {
                            nodes: [],
                            pageInfo: { hasNextPage: true, endCursor: null },
                        },
                    },
                },
            },
        });
    await expect(linkedIssues(1)).rejects.toThrow('курсора');
});
