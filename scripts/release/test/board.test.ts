import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { updateReleaseBoard } from '../board.ts';
import { readChangeReport } from '../report.ts';
import { fixture, REPO } from './fixture.ts';

let f: ReturnType<typeof fixture>;
let warnings: ReturnType<typeof spyOn>;
let expectedWarnings: string[];
beforeEach(() => {
    expectedWarnings = [];
    warnings = spyOn(console, 'warn').mockImplementation(() => {});
    f = fixture();
    f.publish();
    f.issues.delete(1);
    f.issues.delete(3);
});
afterEach(() => {
    try {
        expect(warnings.mock.calls).toEqual(expectedWarnings.map((message) => [message]));
    } finally {
        warnings.mockRestore();
        f.restore();
    }
});
const report = () => readChangeReport(REPO, f.root, f.b);
const board = async (kind: 'publish' | 'deploy' | 'rollback', id?: number, fails = false) => {
    const result = await updateReleaseBoard(kind, await report(), id);
    if (fails) expect(result.errors.length).toBeGreaterThan(0);
    else expect(result.errors).toEqual([]);
    expectedWarnings.push(...result.errors);
    return result;
};

test('published release keeps issue open and ready for release', async () => {
    expect((await board('publish')).errors).toEqual([]);
    const issue = f.issues.get(2)!;
    expect([issue.state, issue.card.status]).toEqual(['open', 'Ready for release']);
});
test('successful deploy closes completed before Done; rollback never reopens', async () => {
    expect((await board('deploy', f.production())).errors).toEqual([]);
    const issue = f.issues.get(2)!;
    expect(f.writes.map((x) => x.kind)).toEqual(['close', 'status']);
    expect([issue.state, issue.state_reason, issue.card.status]).toEqual([
        'closed',
        'completed',
        'Done',
    ]);
    expect((await board('rollback', f.production('rollback', f.root, f.b))).errors).toEqual([]);
    expect(f.writes.filter((x) => x.kind === 'reopen')).toHaveLength(0);
    expect(issue.card.status).toBe('Rollback from production');
});
test('failed production cannot close', async () => {
    await expect(board('deploy', f.production('deploy', f.b, f.root, 'failure'))).rejects.toThrow();
    expect(f.writes).toEqual([]);
});
test('latest related merge wins', async () => {
    f.prs.set(4, { ...f.prs.get(2)!, number: 4, mergeCommit: { oid: f.c } });
    f.issues.get(2)!.prs.push(4);
    await board('deploy', f.production());
    expect(f.writes).toEqual([]);
});
test('reopen protects old merge', async () => {
    f.issues.get(2)!.events.push({ kind: 'ReopenedEvent', createdAt: '2026-11-01T02:00:00Z' });
    await board('deploy', f.production());
    expect(f.writes).toEqual([]);
});
test('new merge after reopen starts cycle', async () => {
    f.issues.get(2)!.events.push({ kind: 'ReopenedEvent', createdAt: '2026-11-01T00:30:00Z' });
    expect((await board('deploy', f.production())).errors).toEqual([]);
    expect(f.issues.get(2)!.state).toBe('closed');
});
test('manual completed survives publish', async () => {
    Object.assign(f.issues.get(2)!, { state: 'closed', state_reason: 'completed' });
    f.issues.get(2)!.card.status = 'Done';
    await board('publish');
    expect(f.writes).toEqual([]);
});
test('not planned stays untouched', async () => {
    Object.assign(f.issues.get(2)!, { state: 'closed', state_reason: 'not_planned' });
    await board('deploy', f.production());
    expect(f.writes).toEqual([]);
});
test('close 403 prevents Done', async () => {
    f.extra = (url, _body, init) =>
        url.pathname.includes('/issues/') && init?.method === 'PATCH'
            ? new Response('denied', { status: 403 })
            : undefined;
    expect((await board('deploy', f.production(), true)).errors.join()).toContain('403');
    expect(f.writes).toEqual([]);
});
test('Project 503 after close is repaired without a second close', async () => {
    let fail = true;
    f.extra = (_url, body) =>
        fail && body?.query?.includes('UpdateReleaseStatus')
            ? new Response('unavailable', { status: 503 })
            : undefined;
    const id = f.production();
    expect((await board('deploy', id, true)).errors.join()).toContain('503');
    expect(f.issues.get(2)!.state).toBe('closed');
    fail = false;
    expect((await board('deploy', id)).errors).toEqual([]);
    expect(f.writes.map((x) => x.kind)).toEqual(['close', 'status']);
});
test('changed state before write is rechecked', async () => {
    let reads = 0;
    f.extra = (_url, body) => {
        if (body?.query?.includes('BoardIssue') && ++reads === 2)
            Object.assign(f.issues.get(2)!, { state: 'closed', state_reason: 'not_planned' });
    };
    await board('deploy', f.production());
    expect(f.writes).toEqual([]);
});

test('pagination includes last PR and compares graph rather than timestamps', async () => {
    f.prs.set(4, {
        ...f.prs.get(2)!,
        number: 4,
        mergedAt: '2026-10-01T00:00:00Z',
        mergeCommit: { oid: f.c },
    });
    f.extra = (_url, body) => {
        if (!body?.query?.includes('MergedIssuePullRequests')) return;
        return Response.json({
            data: {
                node: {
                    repository: { nameWithOwner: REPO, defaultBranchRef: { name: 'main' } },
                    closedByPullRequestsReferences: {
                        nodes: [f.prs.get(body.variables.cursor ? 4 : 2)],
                        pageInfo: {
                            hasNextPage: !body.variables.cursor,
                            endCursor: body.variables.cursor ? null : 'next',
                        },
                    },
                },
            },
        });
    };
    await board('deploy', f.production());
    expect(f.writes).toEqual([]);
});
test.each([null, 'same'])(
    'incomplete or repeating PR pagination %s cannot write',
    async (cursor) => {
        f.extra = (_url, body) => {
            if (!body?.query?.includes('MergedIssuePullRequests')) return;
            return Response.json({
                data: {
                    node: {
                        repository: { nameWithOwner: REPO, defaultBranchRef: { name: 'main' } },
                        closedByPullRequestsReferences: {
                            nodes: [f.prs.get(2)],
                            pageInfo: { hasNextPage: true, endCursor: cursor },
                        },
                    },
                },
            });
        };
        expect((await board('deploy', f.production(), true)).errors.length).toBeGreaterThan(0);
        expect(f.writes).toEqual([]);
    },
);
test('old deploy recovers after same-SHA deploy but cannot undo later rollback', async () => {
    const id = f.production();
    f.production('deploy', f.b, f.b);
    expect((await board('deploy', id)).errors).toEqual([]);
    expect(f.issues.get(2)!.card.status).toBe('Done');
    const rollback = f.production('rollback', f.root, f.b);
    await board('rollback', rollback);
    const count = f.writes.length;
    await board('deploy', id);
    expect(f.writes).toHaveLength(count);
    expect(f.issues.get(2)!.card.status).toBe('Rollback from production');
});
test('new pending production blocks old successful operation', async () => {
    const id = f.production();
    f.production('deploy', f.c, f.b, 'pending');
    await expect(board('deploy', id)).rejects.toThrow();
    expect(f.writes).toEqual([]);
});
test('manual completed before first CD does not prove production presence', async () => {
    Object.assign(f.issues.get(2)!, {
        state: 'closed',
        state_reason: 'completed',
        events: [{ kind: 'ClosedEvent', createdAt: '2026-11-01T02:00:00Z', closer: null }],
    });
    f.issues.get(2)!.card.status = 'Done';
    await board('rollback', f.production('rollback', f.root, f.b));
    expect(f.writes).toEqual([]);
});
test('manual completed participates in rollback after confirmed CD', async () => {
    Object.assign(f.issues.get(2)!, { state: 'closed', state_reason: 'completed' });
    f.issues.get(2)!.card.status = 'Done';
    await board('deploy', f.production());
    await board('rollback', f.production('rollback', f.root, f.b));
    expect(f.writes.map((write) => write.kind)).toEqual(['status']);
    expect(f.issues.get(2)!.card.status).toBe('Rollback from production');
});
test('production becoming pending before write cannot close', async () => {
    let reads = 0;
    f.extra = (_url, body) => {
        if (body?.query?.includes('BoardIssue') && ++reads === 2)
            f.production('deploy', f.c, f.b, 'pending');
    };
    expect((await board('deploy', f.production(), true)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});
test('new related merge before write cannot close', async () => {
    let reads = 0;
    f.extra = (_url, body) => {
        if (body?.query?.includes('BoardIssue') && ++reads === 2) {
            f.prs.set(4, { ...f.prs.get(2)!, number: 4, mergeCommit: { oid: f.c } });
            f.issues.get(2)!.prs.push(4);
        }
    };
    await board('deploy', f.production());
    expect(f.writes).toEqual([]);
});
test('one issue failure does not prevent the next issue', async () => {
    f.issues.set(3, {
        ...f.issues.get(2)!,
        id: 'I3',
        number: 3,
        prs: [3],
        events: [],
        card: { id: 'C3', status: 'Ready for release', updatedAt: '2026-11-01T01:00:00Z' },
    });
    f.extra = (url, _body, init) =>
        url.pathname.endsWith('/issues/2') && init?.method === 'PATCH'
            ? new Response('denied', { status: 403 })
            : undefined;
    expect((await board('deploy', f.production(), true)).errors).toHaveLength(1);
    expect(f.issues.get(3)!.state).toBe('closed');
});
test.each(['environment', 'task', 'sha', 'base', 'release', 'missing id'])(
    'invalid production %s cannot close',
    async (field) => {
        const id = f.production();
        const operation = f.deployments[0]!;
        if (field === 'environment') operation.environment = 'staging';
        if (field === 'task') operation.task = 'rollback';
        if (field === 'sha') operation.sha = f.c;
        if (field === 'base') operation.payload.notification!.base_sha = f.a;
        if (field === 'release') operation.payload.release_id = 999;
        await expect(board('deploy', field === 'missing id' ? undefined : id)).rejects.toThrow();
        expect(f.writes).toEqual([]);
    },
);
test('draft Release cannot advance issue', async () => {
    f.releases.get(f.b)!.draft = true;
    await expect(board('publish')).rejects.toThrow();
    expect(f.writes).toEqual([]);
});
test('changed close response cannot assign Done', async () => {
    f.extra = (url, _body, init) =>
        url.pathname.includes('/issues/') && init?.method === 'PATCH'
            ? Response.json({ number: 2, state: 'open', state_reason: null })
            : undefined;
    expect((await board('deploy', f.production(), true)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});
test('wrong issue number cannot close an unrelated issue', async () => {
    f.issues.set(1, {
        ...f.issues.get(2)!,
        number: 1,
        id: 'I1',
        prs: [1],
        events: [],
        card: { ...f.issues.get(2)!.card, id: 'C1' },
    });
    const r = await report();
    r.issues = r.issues.filter((issue) => issue.id === 'I2');
    r.issues[0]!.number = 1;
    const result = await updateReleaseBoard('deploy', r, f.production());
    expectedWarnings.push(...result.errors);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});

test('incomplete card pagination cannot write', async () => {
    f.extra = (_url, body) =>
        body?.query?.includes('BoardCard')
            ? Response.json({
                  data: {
                      node: {
                          projectItems: {
                              nodes: [{ id: 'C2', project: { id: 'P' }, fieldValueByName: null }],
                              pageInfo: {},
                          },
                      },
                  },
              })
            : undefined;
    expect((await board('deploy', f.production(), true)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});
test('incomplete issue state cannot close', async () => {
    f.extra = (_url, body) =>
        body?.query?.includes('BoardIssue')
            ? Response.json({
                  data: {
                      node: {
                          number: 2,
                          closed: false,
                          repository: { nameWithOwner: REPO },
                          timelineItems: {
                              nodes: [],
                              pageInfo: { hasPreviousPage: false, startCursor: null },
                          },
                      },
                  },
              })
            : undefined;
    expect((await board('deploy', f.production(), true)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});
test('malformed linked issues pagination rejects report before writes', async () => {
    f.extra = (_url, body) =>
        body?.query?.includes('LinkedIssues')
            ? Response.json({
                  data: {
                      repository: {
                          pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: {} } },
                      },
                  },
              })
            : undefined;
    await expect(board('deploy', f.production())).rejects.toThrow();
    expect(f.writes).toEqual([]);
});
test('publish does not lower advanced status of current cycle', async () => {
    const issue = f.issues.get(2)!;
    issue.card.status = 'Rollback from production';
    issue.card.updatedAt = '2026-11-01T03:00:00Z';
    await board('publish');
    expect(f.writes).toEqual([]);
});
test('rollback followed by deploy returns Done without second close', async () => {
    await board('deploy', f.production());
    await board('rollback', f.production('rollback', f.root, f.b));
    await board('deploy', f.production());
    expect(f.issues.get(2)!.card.status).toBe('Done');
    expect(f.writes.filter((write) => write.kind === 'close')).toHaveLength(1);
});

test('rollback records removed production changes even when earlier close failed', async () => {
    f.production();
    expect((await board('rollback', f.production('rollback', f.root, f.b))).errors).toEqual([]);
    const issue = f.issues.get(2)!;
    expect([issue.state, issue.card.status]).toEqual(['open', 'Rollback from production']);
    expect(f.writes.map((write) => write.kind)).toEqual(['status']);
});
test('malformed deployment history cannot close', async () => {
    f.extra = (url) =>
        url.pathname.endsWith('/deployments') ? Response.json({ length: 0 }) : undefined;
    await expect(board('deploy', f.production())).rejects.toThrow();
    expect(f.writes).toEqual([]);
});
test('repeated full deployment page fails before another page or write', async () => {
    const id = f.production();
    let pages = 0;
    f.extra = (url) => {
        if (!url.pathname.endsWith('/deployments')) return;
        if (++pages > 2) throw Error('fixture: unbounded deployment pagination');
        return Response.json(
            Array.from({ length: 100 }, (_, index) => ({ ...f.deployments[0], id: index + 1 })),
        );
    };
    await expect(board('deploy', id)).rejects.toThrow('повтор');
    expect(pages).toBe(2);
    expect(f.writes).toEqual([]);
});

test('missing card identity fails before closing issue', async () => {
    f.extra = (_url, body) =>
        body?.query?.includes('BoardCard')
            ? Response.json({
                  data: {
                      node: {
                          projectItems: {
                              nodes: [{ project: { id: 'P' }, fieldValueByName: null }],
                              pageInfo: { hasNextPage: false, endCursor: null },
                          },
                      },
                  },
              })
            : undefined;
    expect((await board('deploy', f.production(), true)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});

test('confirmation mismatch reports the latest observed state', async () => {
    let written = false;
    f.extra = (_url, body) => {
        if (body?.query?.includes('UpdateReleaseStatus')) written = true;
        if (written && body?.query?.includes('BoardIssue')) {
            const issue = f.issues.get(2)!;
            issue.state = 'open';
            issue.state_reason = null;
            issue.card.status = 'In review';
            issue.events.push({ kind: 'ReopenedEvent', createdAt: '2026-11-01T05:00:00Z' });
        }
    };
    const result = await board('deploy', f.production(), true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('open/In review -> Done; error: Нет подтверждения Status');
});
