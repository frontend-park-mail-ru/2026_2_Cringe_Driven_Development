import { readReleaseSnapshot } from './catalog.ts';
import { syncBoard, type BoardResult } from './board.ts';
import { readAutomationSource } from './source.ts';

/** Сверяет только доску; enqueue и журнал доставки этой работе не принадлежат. */
export async function reconcileBoard(
    repoDir: string,
): Promise<{ allowed: boolean; board: BoardResult | null; errors: string[] }> {
    const result: { allowed: boolean; board: BoardResult | null; errors: string[] } = {
        allowed: false,
        board: null,
        errors: [],
    };
    try {
        const source = await readAutomationSource();
        if (!source) return result;
        result.allowed = true;
        result.board = await syncBoard(await readReleaseSnapshot(repoDir), repoDir);
        result.errors.push(...result.board.errors);
    } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
    }
    return result;
}
