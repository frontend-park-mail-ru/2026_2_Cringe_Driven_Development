import { afterEach, beforeEach, expect, test } from 'bun:test';
import { syncBoard } from './board.ts';
import { readReleaseSnapshot } from './catalog.ts';
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
let read: ((number: number) => void) | undefined;

beforeEach(() => {
    f = fixture();
    f.publish();
    f.deploy();
    writes = [];
    states = new Map();
    canUpdate = true;
    read = undefined;
    for (const number of [1, 2])
        states.set(number, {
            closed: true,
            title: 'Frontend. Test',
            status: 'Done',
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
                                        options: [
                                            { id: 'ready', name: 'Ready for release' },
                                            { id: 'done', name: 'Done' },
                                        ],
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
            const status = vars.option === 'ready' ? 'Ready for release' : 'Done';
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

test.each([1, 2])('production читается дважды независимо от числа карточек: %i', async (count) => {
    if (count === 1) states.get(2)!.closed = false;
    const snapshot = await readReleaseSnapshot(f.dir);
    expect((await syncBoard(snapshot, f.dir)).errors).toEqual([]);
    expect(
        f.requests.filter(
            (r) =>
                r.url.pathname.endsWith('/deployments') &&
                r.url.searchParams.get('environment') === 'production',
        ),
    ).toHaveLength(2);
    expect(
        f.requests.filter((r) => r.url.pathname.endsWith('/deployments/20/statuses')),
    ).toHaveLength(2);
    expect(f.requests.filter((r) => r.url.pathname.endsWith('/pulls'))).toHaveLength(1);
});

test('смена статуса существующей выкатки пересчитывает весь проход без лишнего чтения production', async () => {
    f.deploy(f.b, 21);
    f.statuses.get(21)![0]!.state = 'in_progress';
    read = (number) => {
        if (number === 2) f.statuses.get(21)![0]!.state = 'success';
    };
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    expect(states.get(1)!.status).toBe('Done');
    expect(states.get(2)!.status).toBe('Done');
    expect(writes).toEqual([
        { issue: 2, status: 'Ready for release' },
        { issue: 2, status: 'Done' },
    ]);
    expect(
        f.requests.filter(
            (r) =>
                r.url.pathname.endsWith('/deployments') &&
                r.url.searchParams.get('environment') === 'production',
        ),
    ).toHaveLength(3);
    expect(f.requests.filter((r) => r.url.pathname.endsWith('/pulls'))).toHaveLength(2);
});

test('три изменения production завершаются ошибкой без четвёртого пересчёта', async () => {
    const snapshot = await readReleaseSnapshot(f.dir);
    const original = f.extra!;
    f.extra = (url, body, init) => {
        if (
            url.pathname.endsWith('/deployments') &&
            url.searchParams.get('environment') === 'production'
        ) {
            const status = f.statuses.get(20)![0]!;
            status.state = status.state === 'success' ? 'in_progress' : 'success';
        }
        return original(url, body, init);
    };
    const result = await syncBoard(snapshot, f.dir);
    expect(result.errors).toEqual([
        'История production менялась три прохода подряд; повторите синхронизацию',
    ]);
    expect(
        f.requests.filter(
            (r) =>
                r.url.pathname.endsWith('/deployments') &&
                r.url.searchParams.get('environment') === 'production',
        ),
    ).toHaveLength(4);
    expect(f.requests.filter((r) => r.url.pathname.endsWith('/pulls'))).toHaveLength(3);
});

test('ошибка финального чтения production не скрывается после обновления карточек', async () => {
    const snapshot = await readReleaseSnapshot(f.dir);
    const original = f.extra!;
    f.extra = (url, body, init) =>
        url.pathname.endsWith('/deployments') &&
        url.searchParams.get('environment') === 'production'
            ? Response.json({}, { status: 503 })
            : original(url, body, init);
    await expect(syncBoard(snapshot, f.dir)).rejects.toThrow('503');
    expect(writes).toEqual([{ issue: 2, status: 'Ready for release' }]);
});

test('первый запуск подхватывает только опубликованную и ещё не выкаченную задачу', async () => {
    const snapshot = await readReleaseSnapshot(f.dir);
    expect((await syncBoard(snapshot, f.dir)).errors).toEqual([]);
    expect(writes).toEqual([{ issue: 2, status: 'Ready for release' }]);
    await syncBoard(snapshot, f.dir);
    expect(writes).toHaveLength(1);
});

test('выкатка и последующий откат не возвращают карточку в ожидание', async () => {
    states.get(2)!.status = 'Ready for release';
    f.deploy(f.b, 21);
    f.deploy(f.a, 22);
    await syncBoard(await readReleaseSnapshot(f.dir), f.dir);
    expect(writes).toEqual([{ issue: 2, status: 'Done' }]);
});

test.each(['Ready for build', 'In review', 'Ready for test', 'In testing', null, 'Done'])(
    'публикация переводит %s в Ready for release без предварительного Done',
    async (status) => {
        states.get(2)!.status = status;
        states.get(2)!.statusAt = '2026-10-31T00:00:00Z';
        expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
        expect(writes).toEqual([{ issue: 2, status: 'Ready for release' }]);
    },
);

test('переименование задачи не выключает релизные статусы', async () => {
    states.get(2)!.title = 'Исправить автоматизацию';
    const original = f.extra!;
    f.extra = (url, body, init) => {
        if (String(body?.query).includes('LinkedIssues')) {
            const number = (body!.variables as { number: number }).number;
            return Response.json({
                data: {
                    repository: {
                        pullRequest: {
                            closingIssuesReferences: {
                                nodes: [
                                    {
                                        id: `I${number}`,
                                        number,
                                        title: 'Без префикса',
                                        repository: { nameWithOwner: REPO },
                                    },
                                ],
                                pageInfo: { hasNextPage: false },
                            },
                        },
                    },
                },
            });
        }
        return original(url, body, init);
    };
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    expect(writes).toEqual([{ issue: 2, status: 'Ready for release' }]);
});

test('чужие задачи, открытые и ручные закрытия сохраняются', async () => {
    const state = states.get(2)!;
    const original = { ...state };
    for (const patch of [
        { closed: false },
        { base: 'parent' },
        { merged: false },
        { repo: 'other/repo' },
        { closer: null },
        { reason: 'NOT_PLANNED' },
        { reopened: true, closed: false },
    ]) {
        Object.assign(state, original, patch);
        expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    }
    expect(writes).toEqual([]);
});

test('переоткрытие непосредственно перед записью отменяет изменение', async () => {
    let reads = 0;
    read = (number) => {
        if (number === 2 && ++reads >= 2) {
            states.get(2)!.closed = false;
            states.get(2)!.reopened = true;
        }
    };
    await syncBoard(await readReleaseSnapshot(f.dir), f.dir);
    expect(writes).toEqual([]);
});

test('успешная выкатка во время синхронизации не оставляет устаревший статус', async () => {
    const snapshot = await readReleaseSnapshot(f.dir);
    let changed = false;
    read = (number) => {
        if (number === 2 && !changed) {
            changed = true;
            f.deploy(f.b, 21);
        }
    };
    const result = await syncBoard(snapshot, f.dir);
    expect(result.errors).toEqual([]);
    expect(states.get(2)!.status).toBe('Done');
});

test('GitHub union selection требует __typename aliases, иначе карточки не обновляются', async () => {
    const original = f.extra!;
    f.extra = (url, body, init) => {
        const query = String(body?.query);
        if (
            query.includes('BoardIssue') &&
            [...query.matchAll(/\bkind\s*:\s*__typename\b/g)].length !== 2
        ) {
            return Response.json({
                errors: [{ message: "Selections can't be made directly on unions" }],
            });
        }
        return original(url, body, init);
    };
    const result = await syncBoard(await readReleaseSnapshot(f.dir), f.dir);
    expect(result.errors).toEqual([]);
    expect(writes).toEqual([{ issue: 2, status: 'Ready for release' }]);
});

test('CD при второй карточке пересчитывает и ранее обработанную первую', async () => {
    f.records.production = [];
    let changed = false;
    read = (number) => {
        if (number === 2 && !changed) {
            changed = true;
            f.deploy(f.b, 21);
        }
    };
    const result = await syncBoard(await readReleaseSnapshot(f.dir), f.dir);
    expect(result.errors).toEqual([]);
    expect(states.get(1)!.status).toBe('Done');
    expect(states.get(2)!.status).toBe('Done');
});

test('нет карточки или прав PAT — видимая ошибка без посторонних mutations', async () => {
    states.get(2)!.card = false;
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors.join()).toContain(
        'карточ',
    );
    canUpdate = false;
    await expect(syncBoard(await readReleaseSnapshot(f.dir), f.dir)).rejects.toThrow('Project');
    expect(writes).toEqual([]);
});

test('неуспешная публикация не продвигает Ready for build', async () => {
    states.get(2)!.status = 'Ready for build';
    f.statuses.set(1, [{ state: 'failure', created_at: '2026-11-01T02:00:00Z' }]);
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    expect(writes).toEqual([]);
});

test('неуспешный CD не переводит опубликованную задачу в Done', async () => {
    states.get(2)!.status = 'Ready for release';
    f.deploy(f.b, 21);
    f.statuses.set(21, [{ state: 'failure', created_at: '2026-11-01T03:00:00Z' }]);
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    expect(writes).toEqual([]);
});

test('новый закрывающий PR после reopen определяет новый цикл', async () => {
    const state = states.get(2)!;
    state.reopened = true;
    state.closedAt = '2026-11-01T04:00:00Z';
    state.closer = 3;
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    expect(writes).toEqual([]);
    state.closer = 2;
    expect((await syncBoard(await readReleaseSnapshot(f.dir), f.dir)).errors).toEqual([]);
    expect(writes).toEqual([{ issue: 2, status: 'Ready for release' }]);
});
