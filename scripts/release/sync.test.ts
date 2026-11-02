import { afterEach, beforeEach, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as sync from './sync.ts';
import { fixture, REPO } from './test/fixture.ts';

let f: ReturnType<typeof fixture>;
beforeEach(() => {
    f = fixture();
    Object.assign(process.env, {
        GITHUB_REF: 'refs/heads/main',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_EVENT_PATH: join(f.dir, 'event.json'),
        GITHUB_RUN_ID: '999',
        GITHUB_STEP_SUMMARY: join(f.dir, 'summary.md'),
        TELEGRAM_BOT_TOKEN: 'token',
        TELEGRAM_CHAT_ID: '1',
    });
    writeFileSync(
        process.env.GITHUB_EVENT_PATH!,
        JSON.stringify({ repository: { full_name: REPO } }),
    );
});
afterEach(() => f.restore());

test('board entrypoint игнорирует enqueue без чтения данных и записи журнала', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request_target';
    writeFileSync(
        process.env.GITHUB_EVENT_PATH!,
        JSON.stringify({
            repository: { full_name: REPO },
            action: 'enqueued',
            pull_request: { number: 1, base: { ref: 'main' }, updated_at: '2026-11-01T02:00:00Z' },
        }),
    );
    expect((await sync.reconcileBoard(f.dir)).allowed).toBe(false);
    expect(f.requests).toHaveLength(0);
    expect(f.records['release-automation']).toHaveLength(0);
});

test('sync_uses_project_without_telegram_or_release_journal', async () => {
    f.publish();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    f.extra = (_url, body) =>
        String(body?.query).includes('ReleaseProject')
            ? Response.json({ errors: [{ message: 'denied' }] })
            : undefined;
    const result = await sync.reconcileBoard(f.dir);
    expect(result.errors).toHaveLength(1);
    expect(f.requests.some((r) => r.url.hostname === 'api.telegram.org')).toBe(false);
    expect(
        f.requests.some(
            (r) => r.init?.method === 'POST' && r.url.pathname.endsWith('/deployments'),
        ),
    ).toBe(false);
    expect(f.records['release-automation']).toHaveLength(0);
});

test('недоверенный source не запускает board и не создаёт baseline', async () => {
    process.env.GITHUB_REF = 'refs/heads/feature';
    expect((await sync.reconcileBoard(f.dir)).allowed).toBe(false);
    expect(f.requests).toHaveLength(0);
    expect(f.records['release-automation']).toHaveLength(0);
});
