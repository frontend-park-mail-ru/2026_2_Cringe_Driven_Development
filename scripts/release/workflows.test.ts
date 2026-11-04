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

test('Board остаётся отдельной сверкой без Telegram и enqueue', async () => {
    const config = await workflow('release-status.yml');
    expect(config.on.workflow_run).toEqual({
        workflows: ['CI', 'CD', 'Rollback'],
        types: ['completed'],
        branches: ['main'],
    });
    expect(config.on.workflow_dispatch).toBeDefined();
    expect(config.on.pull_request_target).toBeUndefined();
    expect(Object.keys(config.jobs)).toEqual(['board']);
    const board = config.jobs.board!;
    expect(board.concurrency).toEqual({
        group: 'release-board',
        'cancel-in-progress': false,
        queue: 'max',
    });
    expect(board.permissions?.deployments).toBe('read');
    expect(board.env?.ADD_TO_PROJECT_PAT).toBeDefined();
    expect(Object.keys(board.env ?? {}).some((key) => /TELEGRAM|S3|SSH|VAULT/.test(key))).toBe(
        false,
    );
    expect(
        board.steps.find((step) => step.uses?.startsWith('actions/checkout'))?.with,
    ).toMatchObject({ ref: 'main', 'fetch-depth': 0, 'persist-credentials': false });
    expect(board.steps.at(-1)?.run).toBe('bun run release sync');
});

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

test.each(['ci.yml', 'cd.yml', 'rollback.yml', 'release-status.yml', 'sync-to-course.yml'])(
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
            'release-status.yml': ['board'],
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
    const config = await workflow('release-status.yml');
    for (const concurrency of [
        { group: 'test', queue: 'typo', 'cancel-in-progress': false },
        { group: 'test', queue: 'max', 'cancel-in-progress': true },
    ]) {
        expect(() => validateQueue({ ...config, concurrency })).toThrow();
        expect(() =>
            validateQueue({ ...config, jobs: { board: { ...config.jobs.board!, concurrency } } }),
        ).toThrow();
    }
});
