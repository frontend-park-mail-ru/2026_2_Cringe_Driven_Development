import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const OUTCOMES = ['success', 'failure', 'cancelled', 'skipped'];

const source = (name: string) =>
    readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
// выражения этих workflow совпадают по синтаксису с JS
const evaluate = (expression: string, steps: unknown, cancelled = false): unknown =>
    Function(
        'steps',
        'cancelled',
        'always',
        `return (${expression.replace(/^\$\{\{|\}\}$/g, '')})`,
    )(
        steps,
        () => cancelled,
        () => true,
    );

test.each(['cd', 'rollback'])('%s: итог выкатки решает только Switch BFF', (name) => {
    const text = source(name);
    const job = (Bun.YAML.parse(text) as any).jobs[name];
    const find = (id: string) => job.steps.find((step: any) => step.id === id);
    const index = (id: string) => job.steps.indexOf(find(id));
    const gated = name === 'cd' ? ['board', 'retention'] : ['board'];

    expect(text).not.toMatch(/release health|Health check|steps\.health/);
    expect(find('switch').run).toContain('deploy-bff.yml');
    expect(find('switch').if).toBeUndefined();
    expect(find('switch')['continue-on-error']).toBeUndefined();
    expect(index('check')).toBeLessThan(index('switch'));
    expect(index('switch')).toBeLessThan(index('finish'));
    // без always() после сбоя Switch BFF запись навсегда осталась бы in_progress
    expect(find('finish').if).toBe('always() && steps.start.outputs.deployment_id');
    for (const id of gated) expect(index('finish')).toBeLessThan(index(id));

    for (const outcome of OUTCOMES) {
        const result = evaluate(find('finish').env.RESULT, { switch: { outcome } });
        expect(result).toBe(
            outcome === 'success' ? 'success' : outcome === 'failure' ? 'failure' : 'error',
        );
        for (const finish of OUTCOMES) {
            for (const cancelled of [false, true]) {
                const steps = { switch: { outcome }, finish: { outcome: finish } };
                for (const id of gated) {
                    expect(Boolean(evaluate(find(id).if, steps, cancelled))).toBe(
                        !cancelled && outcome === 'success' && finish === 'success',
                    );
                }
            }
        }
    }
});
