import { updateReleaseBoard, type BoardResult } from './board.ts';
import { readBoardProduction } from './deployments.ts';
import { need } from './env.ts';
import { readChangeReport } from './report.ts';

/** Восстанавливает карточки исходной успешной операции без повторной выкатки. */
export async function recoverReleaseBoard(deploymentId: number): Promise<BoardResult> {
    try {
        const { operation } = await readBoardProduction(deploymentId);
        const { action, notification } = operation.payload;
        const base = notification!.base_sha!;
        const report = await readChangeReport(
            need('GITHUB_REPOSITORY'),
            action === 'rollback' ? operation.sha : base,
            action === 'rollback' ? base : operation.sha,
        );
        return await updateReleaseBoard(action, report, deploymentId);
    } catch (error) {
        return {
            changed: 0,
            skipped: 0,
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
}
