import { need, ReleaseError } from './env.ts';
import { readTrustedRun, type TrustedRun } from './catalog.ts';

const REPOSITORY = 'Cringe-Driven-Development-Team/frontend';
/** Проверенный источник запуска автоматики, без побочных эффектов. */
export type AutomationSource = { kind: 'workflow'; run: TrustedRun } | { kind: 'manual' };

/** Допускает только main и проверенные события текущего репозитория. */
export async function readAutomationSource(): Promise<AutomationSource | undefined> {
    if (
        process.env.GITHUB_REPOSITORY !== REPOSITORY ||
        process.env.GITHUB_REF !== 'refs/heads/main'
    )
        return;
    const event = (await Bun.file(need('GITHUB_EVENT_PATH')).json()) as {
        repository?: { full_name: string };
        workflow_run?: { id: number; event: string; head_branch: string };
    };
    if (event?.repository?.full_name !== REPOSITORY) return;
    switch (process.env.GITHUB_EVENT_NAME) {
        case 'workflow_dispatch':
            return { kind: 'manual' };
        case 'workflow_run': {
            const source = event.workflow_run;
            if (
                !source ||
                source.head_branch !== 'main' ||
                !['push', 'workflow_dispatch'].includes(source.event)
            )
                return;
            if (!Number.isSafeInteger(source.id) || source.id <= 0)
                throw new ReleaseError('Некорректный Actions run ID');
            const run = await readTrustedRun(source.id);
            if ((source.event === 'push') !== (run.kind === 'publish'))
                throw new ReleaseError('Событие workflow_run не совпало с Actions API');
            return { kind: 'workflow', run };
        }
    }
}
