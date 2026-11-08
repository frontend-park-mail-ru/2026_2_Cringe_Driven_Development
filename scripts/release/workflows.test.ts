import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';

interface Step {
    id?: string;
    name?: string;
    run?: string;
    uses?: string;
    if?: string;
    'continue-on-error'?: boolean;
    with?: Record<string, unknown>;
    env?: Record<string, string>;
}
interface Workflow {
    on: Record<string, { types?: string[]; workflows?: string[]; branches?: string[] }>;
    permissions: Record<string, string>;
    concurrency?: { group: string; 'cancel-in-progress': boolean; queue?: string };
    jobs: Record<
        string,
        {
            environment?: unknown;
            steps: Step[];
            if?: string;
            env?: Record<string, string>;
            needs?: unknown;
            concurrency?: { group: string; 'cancel-in-progress': boolean; queue?: string };
            permissions?: Record<string, string>;
        }
    >;
}
async function workflow(name: string): Promise<Workflow> {
    return Bun.YAML.parse(
        await Bun.file(new URL(`../../.github/workflows/${name}`, import.meta.url)).text(),
    ) as Workflow;
}

test('historical Board workflow is removed', async () => {
    expect(
        await Bun.file(
            new URL('../../.github/workflows/release-status.yml', import.meta.url),
        ).exists(),
    ).toBe(false);
});

test.each(['ci.yml', 'cd.yml', 'rollback.yml'])(
    '%s updates report issues only after operation success in the shared queue',
    async (name) => {
        const config = await workflow(name);
        const job =
            config.jobs[name === 'ci.yml' ? 'publish' : name === 'cd.yml' ? 'cd' : 'rollback']!;
        expect(job.concurrency).toEqual({
            group: 'release-board',
            queue: 'max',
            'cancel-in-progress': false,
        });
        for (const id of ['report', 'board'])
            expect(job.steps.find((step) => step.id === id)?.env?.RELEASE_REPORT_FILE).toBe(
                '${{ runner.temp }}/release-report.json',
            );
        expect(job.env?.ADD_TO_PROJECT_PAT).toBeUndefined();
        const board = job.steps.findIndex((step) => step.id === 'board');
        expect(board).toBeGreaterThan(0);
        const boardStep = job.steps[board]!;
        expect(boardStep.env?.ADD_TO_PROJECT_PAT).toBe('${{ secrets.ADD_TO_PROJECT_PAT }}');
        expect(job.steps.filter((step) => step.env?.ADD_TO_PROJECT_PAT)).toHaveLength(1);
        expect(boardStep.run).toBe(
            `bun run release board ${name === 'ci.yml' ? 'publish' : name === 'cd.yml' ? 'deploy' : 'rollback'} "$SHA"`,
        );
        expect(boardStep.if).toContain('!cancelled()');
        if (name === 'ci.yml') {
            expect(boardStep.if).toContain("steps.register.outcome == 'success'");
            expect(boardStep.if).toContain("steps.published.outputs.published != 'true'");
            expect(board).toBeGreaterThan(job.steps.findIndex((step) => step.id === 'register'));
            expect(job.needs).toBe('check');
            expect(JSON.stringify(config.jobs.check)).not.toContain('ADD_TO_PROJECT_PAT');
        } else {
            expect(boardStep.if).toContain("steps.health.outcome == 'success'");
            expect(boardStep.if).toContain("steps.finish.outcome == 'success'");
            const finish = job.steps.findIndex((step) => step.id === 'finish');
            expect(board).toBeGreaterThan(finish);
            const direction = job.steps.findIndex((step) => step.id === 'direction');
            expect(direction).toBeGreaterThan(
                job.steps.findIndex(
                    (step) => step.id === (name === 'cd.yml' ? 'confirmed' : 'target'),
                ),
            );
            expect(direction).toBeLessThan(job.steps.findIndex((step) => step.id === 'start'));
            expect(direction).toBeLessThan(
                job.steps.findIndex((step) => step.name === 'Prepare SSH and Vault files'),
            );
            expect(direction).toBeLessThan(job.steps.findIndex((step) => step.id === 'switch'));
            expect(job.steps[direction]?.env?.RELEASE_BEFORE_SHA).toContain('before_sha');
            expect(job.steps[direction]?.run).toBe(
                `bun run release direction ${name === 'cd.yml' ? 'deploy' : 'rollback'} "$SHA"`,
            );
            expect(job.steps[0]?.with?.['fetch-depth']).toBe(0);
            if (name === 'cd.yml') {
                const retention = job.steps.find((step) => step.id === 'retention')!;
                expect(retention.if).toBe(
                    "!cancelled() && steps.health.outcome == 'success' && steps.finish.outcome == 'success'",
                );
            }
        }
    },
);

const evaluate = (expression: string, steps: Record<string, unknown>, cancelled = false) =>
    Function(
        'steps',
        'cancelled',
        'success',
        `return (${expression});`,
    )(
        steps,
        () => cancelled,
        () => false,
    );

test.each(['ci.yml', 'cd.yml', 'rollback.yml'])(
    '%s gates Board on product success and keeps cleanup after card failure',
    async (name) => {
        const config = await workflow(name);
        const job =
            config.jobs[name === 'ci.yml' ? 'publish' : name === 'cd.yml' ? 'cd' : 'rollback']!;
        const board = job.steps.find((step) => step.id === 'board')!;
        if (name === 'ci.yml') {
            for (const outcome of ['failure', 'cancelled', 'skipped'])
                expect(
                    evaluate(board.if!, {
                        register: { outcome },
                        published: { outputs: { published: 'false' } },
                    }),
                ).toBe(false);
            expect(
                evaluate(board.if!, {
                    register: { outcome: 'success' },
                    published: { outputs: { published: 'true' } },
                }),
            ).toBe(false);
            expect(
                evaluate(
                    board.if!,
                    {
                        register: { outcome: 'success' },
                        published: { outputs: { published: 'false' } },
                    },
                    true,
                ),
            ).toBe(false);
            expect(
                evaluate(board.if!, {
                    register: { outcome: 'success' },
                    published: { outputs: { published: 'false' } },
                }),
            ).toBe(true);
            // course-sync is a sibling; its outcome cannot cancel a completed publication.
            expect(job.needs).toBe('check');
        } else {
            const ready = {
                health: { outcome: 'success' },
                finish: { outcome: 'success' },
                board: { outcome: 'failure' },
            };
            expect(evaluate(board.if!, ready)).toBe(true);
            expect(evaluate(board.if!, ready, true)).toBe(false);
            for (const outcome of ['failure', 'cancelled', 'skipped']) {
                expect(evaluate(board.if!, { ...ready, health: { outcome } })).toBe(false);
                expect(evaluate(board.if!, { ...ready, finish: { outcome } })).toBe(false);
            }
            if (name === 'cd.yml') {
                const retention = job.steps.find((step) => step.id === 'retention')!;
                expect(evaluate(retention.if!, ready)).toBe(true);
                expect(evaluate(retention.if!, ready, true)).toBe(false);
                expect(evaluate(retention.if!, { ...ready, health: { outcome: 'failure' } })).toBe(
                    false,
                );
                expect(evaluate(retention.if!, { ...ready, finish: { outcome: 'failure' } })).toBe(
                    false,
                );
            }
        }
    },
);

test.each(['ci.yml', 'cd.yml', 'rollback.yml'])(
    '%s не отправляет release-сообщения в Telegram',
    async (name) => {
        const config = await workflow(name);
        const job =
            config.jobs[name === 'ci.yml' ? 'publish' : name === 'cd.yml' ? 'cd' : 'rollback']!;
        expect(job.steps.some((step) => step.run?.includes('release notify'))).toBe(false);
        expect(
            job.steps.some((step) =>
                Object.keys(step.env ?? {}).some((key) => key.startsWith('TELEGRAM_')),
            ),
        ).toBe(false);
        if (name !== 'ci.yml') {
            expect(config.permissions['pull-requests']).toBe('read');
            expect(config.permissions.issues).toBe('read');
            const health = job.steps.findIndex((step) => step.id === 'health');
            const finish = job.steps.findIndex((step) =>
                step.run?.startsWith('bun run release finish'),
            );
            expect(finish).toBeGreaterThan(health);
            expect(job.steps[finish]?.if).toBe('always() && steps.start.outputs.deployment_id');
        }
    },
);

test.each(['ci.yml', 'cd.yml', 'rollback.yml'])(
    '%s публикует отчёт до записи операции',
    async (name) => {
        const config = await workflow(name);
        const job =
            config.jobs[name === 'ci.yml' ? 'publish' : name === 'cd.yml' ? 'cd' : 'rollback']!;
        const report = job.steps.findIndex((step) => step.id === 'report');
        const record = job.steps.findIndex(
            (step) =>
                step.run?.startsWith('bun run release register ') ||
                step.run?.startsWith('bun run release start '),
        );
        expect(report).toBeGreaterThanOrEqual(0);
        expect(record).toBeGreaterThan(report);
        expect(job.steps[record]?.env?.RELEASE_REPORT_URL).toBe(
            '${{ steps.report.outputs.report_url }}',
        );
        if (name !== 'ci.yml') {
            const change = job.steps.findIndex((step) => step.id === 'switch');
            expect(job.steps[change - 1]?.id).toBe('start');
        }
    },
);

test('Check собирает образ BFF после сборки, локально и без секретов', async () => {
    const { steps, environment, permissions } = (await workflow('ci.yml')).jobs.check!;
    const build = steps.findIndex((step) => step.run === 'bun run build');
    const image = steps[build + 1]!;
    expect(image.run).toBe('docker build -f apps/bff/Dockerfile -t cdd-bff:ci .');
    expect(image.if).toBeUndefined();
    expect(environment).toBeUndefined();
    expect(permissions).toBeUndefined();
    expect(JSON.stringify(steps)).not.toMatch(/docker (login|push)|secrets\./);
});

test.each(['cd.yml', 'rollback.yml'])('%s берёт плейбук из infra/main', async (name) => {
    const config = await workflow(name);
    const job = config.jobs[name === 'cd.yml' ? 'cd' : 'rollback']!;
    const infra = job.steps.find(
        (step) => step.with?.repository === 'Cringe-Driven-Development-Team/infra',
    );
    expect(infra?.with?.ref).toBe('main');
    expect(JSON.stringify(config)).not.toContain('INFRA_REF');
});

test.each(['ci.yml', 'cd.yml', 'rollback.yml', 'sync-to-course.yml'])(
    '%s не зависит от миграционных флагов, ограничения сохранены',
    async (name) => {
        const text = await Bun.file(
            new URL(`../../.github/workflows/${name}`, import.meta.url),
        ).text();
        expect(text).not.toMatch(/PRODUCTION_ENABLED|COURSE_SYNC_ENABLED/);
        const { jobs } = await workflow(name);
        const guarded = {
            'ci.yml': ['publish', 'course-sync'],
            'cd.yml': ['cd'],
            'rollback.yml': ['rollback'],
            'sync-to-course.yml': ['resolve'],
        }[name]!;
        for (const job of guarded) {
            expect(jobs[job]?.if).toContain(
                "github.repository == 'Cringe-Driven-Development-Team/frontend'",
            );
            expect(jobs[job]?.if).toContain("github.ref == 'refs/heads/main'");
            if (name === 'ci.yml') expect(jobs[job]?.if).toContain("github.event_name == 'push'");
        }
    },
);

test.each([
    ['ci.yml', 'course-sync'],
    ['sync-to-course.yml', 'sync'],
])('%s вызывает общую синхронизацию из .github/main', async (name, job) => {
    const call = (await workflow(name)).jobs[job] as unknown as {
        uses: string;
        with: Record<string, unknown>;
    };
    expect(call.uses).toBe(
        'Cringe-Driven-Development-Team/.github/.github/workflows/sync-to-course.yml@main',
    );
    expect(call.with.automation_ref).toBe('main');
});

function validateQueue(config: Workflow) {
    for (const block of [
        config.concurrency,
        ...Object.values(config.jobs).map((job) => job.concurrency),
    ]) {
        if (!block || typeof block === 'string' || !('queue' in block)) continue;
        if (!['single', 'max'].includes(block.queue!)) throw Error('Invalid queue');
        if (block.queue === 'max' && block['cancel-in-progress'] !== false)
            throw Error('max requires cancel=false');
    }
}

test('все очереди валидны, несмотря на точечное исключение actionlint', async () => {
    for (const name of readdirSync(new URL('../../.github/workflows', import.meta.url)).filter(
        (file) => /\.ya?ml$/.test(file),
    )) {
        validateQueue(await workflow(name));
    }
    const config = await workflow('cd.yml');
    for (const concurrency of [
        { group: 'test', queue: 'typo', 'cancel-in-progress': false },
        { group: 'test', queue: 'max', 'cancel-in-progress': true },
    ]) {
        expect(() => validateQueue({ ...config, concurrency })).toThrow();
        expect(() =>
            validateQueue({ ...config, jobs: { cd: { ...config.jobs.cd!, concurrency } } }),
        ).toThrow();
    }
});

test('CI публикует GitHub Release: contents write только у publish, draft не пересобирается', async () => {
    const config = await workflow('ci.yml');
    expect(config.permissions).toEqual({ contents: 'read' });
    expect(config.jobs.check?.permissions).toBeUndefined();
    const job = config.jobs.publish!;
    expect(job.permissions?.contents).toBe('write');
    expect(job.permissions?.packages).toBe('write');
    expect(job.permissions?.deployments).toBeUndefined();
    for (const id of ['image'])
        expect(job.steps.find((step) => step.id === id)?.if).toBe(
            "steps.published.outputs.build == 'true'",
        );
    for (const name of ['Build release', 'Upload assets'])
        expect(job.steps.find((step) => step.name === name)?.if).toBe(
            "steps.published.outputs.build == 'true'",
        );
    const register = job.steps.find((step) => step.id === 'register')!;
    expect(register.env?.IMAGE_REF).toContain('steps.published.outputs.image_ref');
    expect(JSON.stringify(config)).not.toContain('on: release');
    expect(Object.keys(config.on)).not.toContain('release');
});

test('CD выкатывает выбранный Release: обязательный тег, проверка до VPS, release_id', async () => {
    const config = await workflow('cd.yml');
    const input = (
        config.on.workflow_dispatch as unknown as {
            inputs: Record<string, { required: boolean; type: string }>;
        }
    ).inputs.release;
    expect(input).toMatchObject({ required: true, type: 'string' });
    const job = config.jobs.cd!;
    expect(job.env?.SHA).toBeUndefined();
    const ready = job.steps.findIndex((step) => step.id === 'artifacts');
    expect(job.steps[ready]?.run).toBe('bun run release artifacts "$RELEASE"');
    expect(job.steps[ready]?.env?.RELEASE).toBe('${{ inputs.release }}');
    for (const id of ['direction', 'image', 'check', 'start', 'switch'])
        expect(ready).toBeLessThan(job.steps.findIndex((step) => step.id === id));
    expect(job.steps.find((step) => step.id === 'start')?.env?.RELEASE_ID).toBe(
        '${{ steps.artifacts.outputs.release_id }}',
    );
    expect(
        (await workflow('rollback.yml')).jobs.rollback!.steps.find((step) => step.id === 'start')
            ?.env?.RELEASE_ID,
    ).toBe('${{ steps.target.outputs.release_id }}');
});

test('импорт — отдельный ручной workflow из main с доверенным путём', async () => {
    const config = await workflow('release-import.yml');
    expect(Object.keys(config.on)).toEqual(['workflow_dispatch']);
    const job = config.jobs.import!;
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.permissions?.contents).toBe('write');
    expect(job.steps.at(-1)?.run).toBe('bun run release import');
});
