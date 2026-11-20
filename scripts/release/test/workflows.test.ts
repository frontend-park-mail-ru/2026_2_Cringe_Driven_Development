import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const workflow = (name: string) =>
    Bun.YAML.parse(
        readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'),
    ) as any;
const runs = (step: any, steps: any, cancelled = false) =>
    !step.if || Function('steps', 'cancelled', `return (${step.if})`)(steps, () => cancelled);

test.each(['cd', 'rollback'])(
    '%s writes board only after health and saved success with original ID',
    (name) => {
        const config = workflow(name);
        const job = config.jobs[name];
        const board = job.steps.find((step: any) => step.id === 'board');
        for (const health of ['success', 'failure', 'skipped']) {
            for (const finish of ['success', 'failure', 'skipped']) {
                expect(
                    Boolean(
                        runs(board, { health: { outcome: health }, finish: { outcome: finish } }),
                    ),
                ).toBe(health === 'success' && finish === 'success');
            }
        }
        expect(
            runs(board, { health: { outcome: 'success' }, finish: { outcome: 'success' } }, true),
        ).toBe(false);
        expect(job.steps.findIndex((step: any) => step.id === 'finish')).toBeLessThan(
            job.steps.indexOf(board),
        );
        expect(board.env.RELEASE_DEPLOYMENT_ID).toBe('${{ steps.start.outputs.deployment_id }}');
        expect(config.permissions.issues).toBe('read');
        expect(job.permissions.issues).toBe(name === 'cd' ? 'write' : 'read');
    },
);

test('published rerun generates report and repairs board without build, upload or register', () => {
    const config = workflow('ci');
    const job = config.jobs.publish;
    const steps = {
        published: { outputs: { published: 'true', build: 'false' } },
        report: { outcome: 'success' },
        register: { outcome: 'skipped' },
    };
    for (const name of ['Build release', 'Upload assets', 'Publish BFF image', 'Register release'])
        expect(
            runs(
                job.steps.find((step: any) => step.name === name),
                steps,
            ),
        ).toBe(false);
    expect(
        runs(
            job.steps.find((step: any) => step.id === 'report'),
            steps,
        ),
    ).toBe(true);
    expect(
        runs(
            job.steps.find((step: any) => step.id === 'board'),
            steps,
        ),
    ).toBe(true);
    steps.published.outputs.published = 'false';
    expect(
        runs(
            job.steps.find((step: any) => step.id === 'board'),
            steps,
        ),
    ).toBe(false);
    steps.register.outcome = 'success';
    expect(
        runs(
            job.steps.find((step: any) => step.id === 'board'),
            steps,
        ),
    ).toBe(true);
    expect(job.permissions.issues).toBe('read');
    expect(config.jobs.check.permissions?.issues ?? config.permissions.issues ?? 'none').not.toBe(
        'write',
    );
});

test('all board writers including recovery share the uninterruptible queue', () => {
    for (const [name, id] of [
        ['ci', 'publish'],
        ['cd', 'cd'],
        ['rollback', 'rollback'],
        ['reconcile-issues', 'reconcile'],
    ]) {
        expect(workflow(name!).jobs[id!].concurrency).toEqual({
            group: 'release-board',
            'cancel-in-progress': false,
            queue: 'max',
        });
    }
});

test('recovery uses trusted main and original ID with read-only deployment access and no SSH', () => {
    const config = workflow('reconcile-issues');
    const job = config.jobs.reconcile;
    expect(config.on.workflow_dispatch.inputs.deployment_id).toMatchObject({
        required: true,
        type: 'string',
    });
    expect(job.if).toContain("github.repository == 'Cringe-Driven-Development-Team/frontend'");
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.environment).toEqual({ name: 'production', deployment: false });
    expect(config.permissions).toEqual({
        contents: 'read',
        actions: 'read',
        'pull-requests': 'read',
        deployments: 'read',
        issues: 'write',
    });
    const checkout = job.steps.find((step: any) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout.with.ref).toBe('main');
    const board = job.steps.find((step: any) => step.id === 'board');
    expect(board.env.DEPLOYMENT_ID).toBe('${{ inputs.deployment_id }}');
    expect(board.env.ADD_TO_PROJECT_PAT).toBe('${{ secrets.ADD_TO_PROJECT_PAT }}');
    expect(board.run).toBe('bun run release board-recover "$DEPLOYMENT_ID"');
    const serialized = JSON.stringify(job.steps);
    expect(serialized).not.toMatch(
        /SSH|ansible|release (start|finish|health)|bun run build|DEPLOY_SSH_KEY/,
    );
});
