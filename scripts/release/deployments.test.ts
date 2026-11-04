import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    assertReleaseDirection,
    chooseRollbackTarget,
    finishProduction,
    protectedReleases,
    readyArtifacts,
    startProduction,
} from './deployments.ts';
import { fixture } from './test/fixture.ts';
import { ReleaseError } from './env.ts';
import type { ArtifactsPayload, Deployment, DeploymentState, ProductionPayload } from './github.ts';

const sha = (c: string) => c.repeat(40);
const ref = (c: string) => `ghcr.io/cringe-driven-development-team/bff@sha256:${c.repeat(64)}`;

let id = 0;
/** Запись production: от новых к старым, как отдаёт listDeployments. */
const prod = (
    commit: string,
    image: string,
    state: DeploymentState | undefined,
): Deployment<ProductionPayload> => ({
    id: ++id,
    sha: sha(commit),
    payload: {
        image_ref: ref(image),
        assets: `releases/${sha(commit)}/`,
        action: 'deploy',
        run: '',
    },
    createdAt: '',
    state,
});

test('направление выкатки и отката проверяется по локальному Git до изменений', async () => {
    const f = fixture();
    try {
        await expect(assertReleaseDirection('deploy', f.a, f.b, f.dir)).resolves.toBeUndefined();
        await expect(assertReleaseDirection('rollback', f.b, f.a, f.dir)).resolves.toBeUndefined();
        await expect(assertReleaseDirection('deploy', f.b, f.a, f.dir)).rejects.toThrow(
            'направление',
        );
        await expect(assertReleaseDirection('rollback', f.a, f.b, f.dir)).rejects.toThrow(
            'направление',
        );
        for (const kind of ['deploy', 'rollback'] as const) {
            await expect(assertReleaseDirection(kind, f.a, f.a, f.dir)).resolves.toBeUndefined();
            await expect(assertReleaseDirection(kind, f.a, f.outside, f.dir)).rejects.toThrow();
            await expect(assertReleaseDirection(kind, '', f.b, f.dir)).rejects.toThrow('база');
            await expect(assertReleaseDirection(kind, f.a, sha('f'), f.dir)).rejects.toThrow('Git');
            await expect(assertReleaseDirection(kind, sha('f'), sha('f'), f.dir)).rejects.toThrow(
                'Git',
            );
        }
        expect(f.requests).toHaveLength(0);
    } finally {
        f.restore();
    }
});

test('после A → B → A выбранный историей B отклоняется без поиска другой цели', async () => {
    const f = fixture();
    try {
        const history = [
            prod('a', 'a', 'success'),
            prod('b', 'b', 'success'),
            prod('a', 'a', 'success'),
        ];
        history[0]!.sha = f.a;
        history[1]!.sha = f.b;
        history[2]!.sha = f.a;
        const target = chooseRollbackTarget(history);
        expect(target.sha).toBe(f.b);
        await expect(assertReleaseDirection('rollback', f.a, target.sha, f.dir)).rejects.toThrow();
    } finally {
        f.restore();
    }
});

test('после успешной выкатки откат — к предыдущему успешному с другим digest', () => {
    const target = chooseRollbackTarget([
        prod('c', 'c', 'success'),
        prod('c', 'c', 'success'), // повторная выкатка того же образа не цель
        prod('b', 'b', 'failure'),
        prod('a', 'a', 'success'),
    ]);
    expect(target).toMatchObject({ sha: sha('a'), imageRef: ref('a') });
});

test('после неудачной попытки откат — восстановление последнего успешного', () => {
    for (const state of ['failure', 'error'] as const) {
        const target = chooseRollbackTarget([
            prod('c', 'c', state),
            prod('b', 'b', 'success'),
            prod('a', 'a', 'success'),
        ]);
        expect(target).toMatchObject({ sha: sha('b'), imageRef: ref('b') });
    }
});

test('незавершённая или неизвестная попытка и отсутствие цели — ошибка до изменений', () => {
    for (const state of ['in_progress', 'queued', 'pending', undefined] as const) {
        expect(() =>
            chooseRollbackTarget([prod('b', 'b', state), prod('a', 'a', 'success')]),
        ).toThrow(ReleaseError);
    }
    expect(() => chooseRollbackTarget([])).toThrow('откатываться некуда');
    expect(() => chooseRollbackTarget([prod('a', 'a', 'success')])).toThrow('откатываться некуда');
    expect(() => chooseRollbackTarget([prod('a', 'a', 'failure')])).toThrow(
        'восстанавливать нечего',
    );
});

test('неоднозначный SHA → digest в истории — ошибка', () => {
    expect(() =>
        chooseRollbackTarget([
            prod('b', 'b', 'success'),
            prod('a', 'a', 'success'),
            prod('a', 'd', 'success'),
        ]),
    ).toThrow('цель неоднозначна');
});

test('inactive-записи не участвуют в выборе', () => {
    const target = chooseRollbackTarget([
        prod('c', 'c', 'inactive'),
        prod('b', 'b', 'success'),
        prod('a', 'a', 'success'),
    ]);
    expect(target.sha).toBe(sha('a'));
});

test('retention хранит текущий и предыдущий с другим digest, после неудачи — откладывает', () => {
    expect(
        protectedReleases([
            prod('c', 'c', 'success'),
            prod('c', 'c', 'success'),
            prod('a', 'a', 'success'),
        ]),
    ).toEqual([sha('c'), sha('a')]);
    expect(protectedReleases([prod('c', 'c', 'success')])).toEqual([sha('c')]);
    expect(protectedReleases([])).toEqual([]);
    for (const state of ['failure', 'error', 'in_progress', undefined] as const) {
        expect(
            protectedReleases([prod('c', 'c', state), prod('a', 'a', 'success')]),
        ).toBeUndefined();
    }
});

const artifacts = (
    commit: string,
    image: string,
    state: DeploymentState,
    assets = `releases/${sha(commit)}/`,
): Deployment<ArtifactsPayload> => ({
    id: ++id,
    sha: sha(commit),
    payload: { image_ref: ref(image), assets, ci_run: '' },
    createdAt: '',
    state,
});

test('готовый выпуск — успешная запись release-artifacts этого SHA', () => {
    expect(readyArtifacts([artifacts('a', 'a', 'success')], sha('a'))).toMatchObject({
        image_ref: ref('a'),
    });
    expect(readyArtifacts([artifacts('a', 'a', 'failure')], sha('a'))).toBeUndefined();
    expect(readyArtifacts([], sha('a'))).toBeUndefined();
    expect(() =>
        readyArtifacts([artifacts('a', 'a', 'success'), artifacts('a', 'b', 'success')], sha('a')),
    ).toThrow('разными образами');
    expect(() => readyArtifacts([artifacts('a', 'a', 'success', 'releases/x/')], sha('a'))).toThrow(
        'каталог',
    );
});

test('сбой статуса in_progress: id уже в выходе, итог error, откат к последнему успешному', async () => {
    const env = { ...process.env };
    const realFetch = globalThis.fetch;
    const dir = mkdtempSync(join(tmpdir(), 'release-'));
    const outputFile = join(dir, 'output');
    Object.assign(process.env, {
        GITHUB_OUTPUT: outputFile,
        GITHUB_REPOSITORY: 'team/frontend',
        GITHUB_TOKEN: 'token',
        GITHUB_RUN_ATTEMPT: '1',
    });
    const states: string[] = [];
    let failStatus = true;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/deployments')) return Response.json({ id: 77 }, { status: 201 });
        if (url.endsWith('/deployments/77/statuses')) {
            const { state } = JSON.parse(String(init?.body)) as { state: string };
            if (failStatus) {
                failStatus = false;
                return new Response('unavailable', { status: 503 });
            }
            states.push(state);
            return Response.json({}, { status: 201 });
        }
        throw new Error(`неожиданный запрос ${url}`);
    }) as typeof fetch;
    try {
        await expect(startProduction(sha('c'), ref('c'), 'deploy')).rejects.toThrow(ReleaseError);
        const outputId = /deployment_id=(\d+)/.exec(readFileSync(outputFile, 'utf8'))?.[1];
        expect(outputId).toBe('77');

        await finishProduction(outputId!, 'error');
        expect(states).toEqual(['error']);

        const target = chooseRollbackTarget([prod('c', 'c', 'error'), prod('b', 'b', 'success')]);
        expect(target).toMatchObject({ sha: sha('b'), imageRef: ref('b') });
    } finally {
        globalThis.fetch = realFetch;
        process.env = env;
        rmSync(dir, { recursive: true, force: true });
    }
});
