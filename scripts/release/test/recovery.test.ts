import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateReleaseBoard } from '../board.ts';
import { recoverReleaseBoard } from '../recovery.ts';
import { readChangeReport, readOperationReport, reportRelease } from '../report.ts';
import { fixture, REPO } from './fixture.ts';

let f: ReturnType<typeof fixture>;
beforeEach(() => {
    f = fixture();
    f.issues.delete(1);
    f.issues.delete(3);
    f.publish(f.b, f.a);
});
afterEach(() => f.restore());

test('original deployment repairs partial close after B→B and B→C without deploying', async () => {
    const id = f.production('deploy', f.b, f.a);
    const deployRequests: string[] = [];
    let fail = true;
    f.extra = (url, body, init) => {
        if (init?.method === 'POST' && url.pathname.includes('/deployments'))
            deployRequests.push(url.pathname);
        if (fail && body?.query?.includes('UpdateReleaseStatus'))
            return new Response('unavailable', { status: 503 });
    };
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const first = await updateReleaseBoard(
            'deploy',
            await readChangeReport(REPO, f.a, f.b),
            id,
        );
        expect(first.errors).toHaveLength(1);
        expect(first.errors[0]).toContain('closed/Ready for build -> Done');
        expect(first.errors[0]).toContain('503');
        expect(warn.mock.calls).toEqual(first.errors.map((message) => [message]));
    } finally {
        warn.mockRestore();
    }
    fail = false;
    f.production('deploy', f.b, f.b);
    f.production('deploy', f.c, f.b);
    const result = await recoverReleaseBoard(id);
    expect(result.errors).toEqual([]);
    expect(f.issues.get(2)!.card.status).toBe('Done');
    const closeRequests = f.writes.filter((write) => write.kind === 'close');
    expect(closeRequests).toHaveLength(1);
    expect(deployRequests).toHaveLength(0);
});

test('old deploy after rollback does not restore Done', async () => {
    const id = f.production('deploy', f.b, f.a);
    f.production('rollback', f.a, f.b);
    const result = await recoverReleaseBoard(id);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(f.writes).toEqual([]);
});

test('old rollback after new deploy does not restore rollback status', async () => {
    f.production('deploy', f.b, f.a);
    const id = f.production('rollback', f.a, f.b);
    f.production('deploy', f.b, f.a);
    const result = await recoverReleaseBoard(id);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(f.writes).toEqual([]);
});

test('rollback recovery changes only Status for removed changes', async () => {
    f.production('deploy', f.b, f.a);
    const result = await recoverReleaseBoard(f.production('rollback', f.a, f.b));
    expect(result.errors).toEqual([]);
    expect(f.writes).toEqual([{ kind: 'status', issue: 2, status: 'Rollback from production' }]);
    expect(f.issues.get(2)!.state).toBe('open');
});

test.each(['pending', 'failure', 'error', ''])('latest %s blocks recovery', async (state) => {
    const id = f.production('deploy', f.b, f.a);
    f.production('deploy', f.c, f.b, state);
    expect((await recoverReleaseBoard(id)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});

test.each([0, -1, 1.5, NaN, Infinity, 999])('invalid ID %s cannot write', async (id) => {
    f.production('deploy', f.b, f.a);
    expect((await recoverReleaseBoard(id)).errors.length).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
});

test.each(['environment', 'action', 'base', 'sha', 'range', 'incomplete report'])(
    'invalid %s cannot write',
    async (field) => {
        const id = f.production('deploy', f.b, f.a);
        const record = f.deployments[0]!;
        if (field === 'environment') record.environment = 'staging';
        if (field === 'action') record.payload.action = 'invalid' as 'deploy';
        if (field === 'base') record.payload.notification!.base_sha = 'invalid';
        if (field === 'sha') record.sha = 'invalid';
        if (field === 'range') record.payload.notification!.base_sha = f.c;
        if (field === 'incomplete report')
            f.extra = (url) =>
                url.pathname.includes('/compare/')
                    ? Response.json({ total_commits: 2, commits: [] })
                    : undefined;
        expect((await recoverReleaseBoard(id)).errors.length).toBeGreaterThan(0);
        expect(f.writes).toEqual([]);
    },
);

test.each(['new merge', 'reopen'])(
    '%s protects original operation from recovery',
    async (change) => {
        const id = f.production('deploy', f.b, f.a);
        if (change === 'new merge') {
            f.prs.set(4, { ...f.prs.get(2)!, number: 4, mergeCommit: { oid: f.c } });
            f.issues.get(2)!.prs.push(4);
        } else {
            f.issues
                .get(2)!
                .events.push({ kind: 'ReopenedEvent', createdAt: '2026-11-01T02:00:00Z' });
        }
        const result = await recoverReleaseBoard(id);
        expect(result.errors).toEqual([]);
        expect(result.skipped).toBe(1);
        expect(f.writes).toEqual([]);
    },
);

test('active main-dispatched CD may deploy a published SHA different from workflow head', async () => {
    const id = f.production('deploy', f.b, f.a);
    f.extra = (url) =>
        url.pathname.endsWith('/actions/runs/101')
            ? Response.json({
                  workflow_id: 2,
                  path: '.github/workflows/cd.yml',
                  event: 'workflow_dispatch',
                  head_branch: 'main',
                  head_sha: f.c,
                  status: 'in_progress',
                  conclusion: null,
                  run_attempt: 1,
                  repository: { full_name: REPO },
                  head_repository: { full_name: REPO },
              })
            : undefined;
    const result = await recoverReleaseBoard(id);
    expect(result.errors).toEqual([]);
    expect(f.issues.get(2)!.state).toBe('closed');
});

test('recovery CLI reports invalid ID in Summary without claiming production success', () => {
    const summary = join(f.dir, 'summary.md');
    const result = Bun.spawnSync(
        ['bun', new URL('../index.ts', import.meta.url).pathname, 'board-recover', 'invalid'],
        { env: { ...process.env, GITHUB_STEP_SUMMARY: summary } },
    );
    expect(result.exitCode).toBe(1);
    const detail = readFileSync(summary, 'utf8');
    expect(detail).toContain('Нужен корректный Deployment ID');
    expect(detail).toContain('Изменено: 0; пропущено: 0');
    expect(detail).not.toContain('Операция успешна');
});

test('published report preserves manifest base when another ancestor release appears', async () => {
    process.env.RELEASE_REPORT_FILE = join(f.dir, 'report.json');
    process.env.GITHUB_OUTPUT = join(f.dir, 'output');
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        await reportRelease('publish', f.b, f.dir);
        const first = await readOperationReport('publish', f.b);
        expect(first.baseSha).toBe(f.a);
        f.publish(f.a, f.root);
        await reportRelease('publish', f.b, f.dir);
        expect((await readOperationReport('publish', f.b)).baseSha).toBe(f.a);
        expect(warn).not.toHaveBeenCalled();
    } finally {
        warn.mockRestore();
    }
});
