import { afterEach, beforeEach, expect, test } from 'bun:test';
import { updateReleaseBoard } from './board.ts';
import type { ChangeReport } from './report.ts';
import { fixture, REPO } from './test/fixture.ts';

let f: ReturnType<typeof fixture>;
const closedAt = '2026-11-01T01:00:00Z';
let writes: { issue: number; status: string }[];
let states: Map<
    number,
    {
        closed: boolean;
        title: string;
        status: string | null;
        statusAt: string;
        closer: number | null;
        reopened: boolean;
        card: boolean;
        repo: string;
        reason: string;
        base: string;
        merged: boolean;
        closedAt: string;
    }
>;
let canUpdate: boolean;
let options: { id: string; name: string }[];
let read: ((number: number) => void) | undefined;

beforeEach(() => {
    f = fixture();
    writes = [];
    states = new Map();
    canUpdate = true;
    options = [
        { id: 'ready', name: 'Ready for release' },
        { id: 'done', name: 'Done' },
        { id: 'rollback', name: 'Rollback from production' },
    ];
    read = undefined;
    for (const number of [1, 2, 3, 4])
        states.set(number, {
            closed: true,
            title: 'Frontend. Test',
            status: 'In review',
            statusAt: closedAt,
            closer: number,
            reopened: false,
            card: true,
            repo: REPO,
            reason: 'COMPLETED',
            base: 'main',
            merged: true,
            closedAt,
        });
    f.extra = (url, body) => {
        if (url.pathname !== '/graphql') return;
        const query = String(body?.query);
        const vars = body?.variables as {
            id?: string;
            option?: string;
            item?: string;
            reset?: boolean;
        };
        if (query.includes('ReleaseProject'))
            return Response.json({
                data: {
                    organization: {
                        projectV2: {
                            id: 'P',
                            viewerCanUpdate: canUpdate,
                            fields: {
                                nodes: [
                                    {
                                        id: 'F',
                                        name: 'Status',
                                        options,
                                    },
                                ],
                                pageInfo: { hasNextPage: false },
                            },
                        },
                    },
                },
            });
        if (query.includes('UpdateReleaseStatus')) {
            const number = Number(vars.item?.slice(1));
            const status =
                vars.option === 'ready'
                    ? 'Ready for release'
                    : vars.option === 'done'
                      ? 'Done'
                      : 'Rollback from production';
            writes.push({ issue: number, status });
            states.get(number)!.status = status;
            states.get(number)!.statusAt = '2026-11-01T05:00:00Z';
            return Response.json({
                data: {
                    updateProjectV2ItemFieldValue: { projectV2Item: { id: vars.item } },
                    clearProjectV2ItemFieldValue: vars.reset
                        ? { projectV2Item: { id: vars.item } }
                        : undefined,
                },
            });
        }
        const number = Number(vars.id?.slice(1));
        const state = states.get(number);
        if (!state) return;
        if (query.includes('BoardIssue')) {
            read?.(number);
            return Response.json({
                data: {
                    node: {
                        closed: state.closed,
                        stateReason: state.reason,
                        title: state.title,
                        repository: { nameWithOwner: state.repo },
                        timelineItems: {
                            nodes: [
                                {
                                    kind: 'ClosedEvent',
                                    createdAt: state.closedAt,
                                    closer: state.closer
                                        ? {
                                              kind: 'PullRequest',
                                              number: state.closer,
                                              merged: state.merged,
                                              baseRefName: state.base,
                                              repository: {
                                                  nameWithOwner: REPO,
                                                  defaultBranchRef: { name: 'main' },
                                              },
                                          }
                                        : null,
                                },
                                ...(state.reopened
                                    ? [
                                          {
                                              kind: 'ReopenedEvent',
                                              createdAt: '2026-11-01T02:00:00Z',
                                          },
                                      ]
                                    : []),
                            ],
                            pageInfo: { hasPreviousPage: false },
                        },
                    },
                },
            });
        }
        if (query.includes('BoardCard'))
            return Response.json({
                data: {
                    node: {
                        projectItems: {
                            nodes: state.card
                                ? [
                                      {
                                          id: `C${number}`,
                                          project: { id: 'P' },
                                          fieldValueByName:
                                              state.status === null
                                                  ? null
                                                  : {
                                                        name: state.status,
                                                        updatedAt: state.statusAt,
                                                    },
                                      },
                                  ]
                                : [],
                            pageInfo: { hasNextPage: false },
                        },
                    },
                },
            });
    };
});
afterEach(() => {
    f.restore();
});

function report(): ChangeReport {
    return {
        baseSha: f.root,
        headSha: f.b,
        complete: true,
        prs: [1, 2, 3].map((number) => ({
            number,
            title: `PR ${number}`,
            url: `https://github.com/${REPO}/pull/${number}`,
            mergeSha: f.b,
        })),
        issues: [1, 2, 3].map((number) => ({
            id: `I${number}`,
            number,
            title: `Issue ${number}`,
            repo: REPO,
            prNumbers: [number],
        })),
    };
}

test('deploy_changes_only_report_issues', async () => {
    const input = report();
    input.issues.push(input.issues[0]!);
    expect(await updateReleaseBoard('deploy', input)).toEqual({
        changed: 3,
        skipped: 0,
        errors: [],
    });
    expect(writes.map((x) => x.issue)).toEqual([1, 2, 3]);
    expect(writes.every((x) => x.status === 'Done')).toBe(true);
    expect(states.get(4)!.status).toBe('In review');
    expect(f.requests.some((r) => (r.body?.variables as { id?: string })?.id === 'I4')).toBe(false);
    expect(
        f.requests.some(
            (r) => r.url.pathname.includes('/deployments') || r.url.pathname.endsWith('/pulls'),
        ),
    ).toBe(false);
});

test('empty report skips Project; incomplete report fails before reading cards', async () => {
    const empty = { ...report(), prs: [], issues: [] };
    expect(await updateReleaseBoard('deploy', empty)).toEqual({
        changed: 0,
        skipped: 0,
        errors: [],
    });
    await expect(updateReleaseBoard('deploy', { ...empty, complete: false })).rejects.toThrow(
        'Неполный',
    );
    expect(f.requests).toEqual([]);
});

test('rollback then deploy applies each successful operation', async () => {
    await updateReleaseBoard('rollback', report());
    expect(writes).toEqual(
        [1, 2, 3].map((issue) => ({ issue, status: 'Rollback from production' })),
    );
    await updateReleaseBoard('deploy', report());
    expect(writes.slice(3)).toEqual([1, 2, 3].map((issue) => ({ issue, status: 'Done' })));
});

test.each(['Done', 'Rollback from production'])(
    'publish preserves current-cycle %s but replaces an old cycle',
    async (status) => {
        for (const state of states.values()) state.status = status;
        expect((await updateReleaseBoard('publish', report())).changed).toBe(0);
        for (const state of states.values()) state.statusAt = '2026-10-31T00:00:00Z';
        expect((await updateReleaseBoard('publish', report())).errors).toEqual([]);
        expect(writes).toEqual([1, 2, 3].map((issue) => ({ issue, status: 'Ready for release' })));
    },
);

test.each(['Ready for build', 'In review', 'Ready for test', 'In testing', null])(
    'publish advances %s without preliminary Done',
    async (status) => {
        states.get(1)!.status = status;
        await updateReleaseBoard('publish', report());
        expect(writes[0]).toEqual({ issue: 1, status: 'Ready for release' });
    },
);

test('current closer must belong to report PRs and issue links', async () => {
    const input = report();
    input.prs = input.prs.filter((pr) => pr.number !== 1);
    input.issues[1]!.prNumbers = [1];
    expect((await updateReleaseBoard('deploy', input)).errors).toEqual([]);
    expect(writes).toEqual([{ issue: 3, status: 'Done' }]);
});

test('renaming a linked issue does not disable release status', async () => {
    states.get(1)!.title = 'Без префикса';
    await updateReleaseBoard('publish', report());
    expect(writes[0]).toEqual({ issue: 1, status: 'Ready for release' });
});

test('foreign, open, manual, not planned, unmerged and wrong-base closures are skipped', async () => {
    const original = { ...states.get(1)! };
    for (const patch of [
        { closed: false },
        { base: 'parent' },
        { merged: false },
        { repo: 'other/repo' },
        { closer: null },
        { reason: 'NOT_PLANNED' },
        { reopened: true },
    ]) {
        Object.assign(states.get(1)!, original, patch);
        await updateReleaseBoard('deploy', { ...report(), issues: [report().issues[0]!] });
    }
    const input = report();
    input.issues[0]!.repo = 'other/repo';
    await updateReleaseBoard('deploy', { ...input, issues: [input.issues[0]!] });
    expect(writes).toEqual([]);
});

test('reopen immediately before mutation cancels update', async () => {
    let reads = 0;
    read = (number) => {
        if (number === 1 && ++reads >= 2) states.get(1)!.closed = false;
    };
    await updateReleaseBoard('deploy', report());
    expect(writes.map((write) => write.issue)).toEqual([2, 3]);
});

test('GraphQL union selections retain both __typename aliases', async () => {
    const original = f.extra!;
    f.extra = (url, body, init) => {
        const query = String(body?.query);
        if (
            query.includes('BoardIssue') &&
            [...query.matchAll(/\bkind\s*:\s*__typename\b/g)].length !== 2
        )
            return Response.json({ errors: [{ message: 'Union selection requires aliases' }] });
        return original(url, body, init);
    };
    expect((await updateReleaseBoard('deploy', report())).errors).toEqual([]);
    expect(writes).toHaveLength(3);
});

test('old matching Status is cleared and confirmed for current closure', async () => {
    const state = states.get(1)!;
    state.status = 'Done';
    state.statusAt = '2026-10-31T00:00:00Z';
    await updateReleaseBoard('deploy', report());
    expect(
        (
            f.requests.find((r) => String(r.body?.query).includes('UpdateReleaseStatus'))!.body!
                .variables as { reset: boolean }
        ).reset,
    ).toBe(true);
    const count = writes.length;
    await updateReleaseBoard('deploy', report());
    expect(writes).toHaveLength(count);
});

test('one card API failure is returned while other issues are updated', async () => {
    const original = f.extra!;
    f.extra = (url, body, init) =>
        (body?.variables as { id?: string })?.id === 'I2'
            ? new Response('unavailable', { status: 503 })
            : original(url, body, init);
    const result = await updateReleaseBoard('deploy', report());
    expect(result.errors.join()).toContain('503');
    expect(writes.map((write) => write.issue)).toEqual([1, 3]);
});

test('missing card is reported; missing option or PAT permission fails before writes', async () => {
    states.get(2)!.card = false;
    expect((await updateReleaseBoard('deploy', report())).errors.join()).toContain('карточ');
    writes = [];
    canUpdate = false;
    await expect(updateReleaseBoard('deploy', report())).rejects.toThrow('Project');
    expect(writes).toEqual([]);
});

test.each(['publish', 'deploy', 'rollback'] as const)(
    'missing target option fails before mutations: %s',
    async (kind) => {
        options = [];
        await expect(updateReleaseBoard(kind, report())).rejects.toThrow('Status');
        expect(writes).toEqual([]);
    },
);

test('only the operation target option is required', async () => {
    options = [{ id: 'done', name: 'Done' }];
    expect((await updateReleaseBoard('deploy', report())).errors).toEqual([]);
    expect(writes).toEqual([1, 2, 3].map((issue) => ({ issue, status: 'Done' })));
});

test.each(['failure', 'missing-confirmation', 'stale-confirmation'])(
    'partial clear/set %s is visible',
    async (failure) => {
        states.get(1)!.status = 'Done';
        states.get(1)!.statusAt = '2026-10-31T00:00:00Z';
        const original = f.extra!;
        f.extra = (url, body, init) => {
            if (
                String(body?.query).includes('UpdateReleaseStatus') &&
                (body?.variables as { item?: string })?.item === 'C1'
            ) {
                if (failure === 'failure') {
                    states.get(1)!.status = null;
                    return Response.json({ errors: [{ message: 'set failed after clear' }] });
                }
                if (failure === 'missing-confirmation') return Response.json({ data: {} });
                return Promise.resolve(original(url, body, init)).then((response) => {
                    states.get(1)!.statusAt = '2026-10-31T00:00:00Z';
                    return response!;
                });
            }
            return original(url, body, init);
        };
        const result = await updateReleaseBoard('deploy', report());
        expect(result.errors).toHaveLength(1);
        expect(writes.filter((write) => write.issue !== 1).map((write) => write.issue)).toEqual([
            2, 3,
        ]);
    },
);
