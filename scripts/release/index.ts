// Выпуск и выкатка, по команде на шаг workflow. Ассеты клиента — неизменяемые releases/{sha}/ в S3
// и на CDN; образ BFF — публичный GHCR по digest; готовые выпуски — GitHub Releases, история прода
// — GitHub Deployments (production). HTML отдаёт работающий образ BFF, указателя в S3 нет.
import { appendFileSync } from 'node:fs';
import { health, releaseCheck } from './checks.ts';
import {
    assertReleaseDirection,
    finishProduction,
    lastConfirmed,
    notificationMetadata,
    rollbackTarget,
    startProduction,
} from './deployments.ts';
import { importReleases } from './import.ts';
import { artifacts, published, publishRelease } from './releases.ts';
import { runUrl } from './github.ts';
import { ReleaseError, checkSha } from './env.ts';
import { updateReleaseBoard, type BoardResult } from './board.ts';
import { checkImage, checkImageRef } from './image.ts';
import { recoverReleaseBoard } from './recovery.ts';
import { retention } from './retention.ts';
import { upload } from './upload.ts';
import { readOperationReport, releaseBody, reportRelease, type ReleaseKind } from './report.ts';

/** Справка по командам: выводится при неверном вызове */
const USAGE = `Использование: bun run release <команда>
  upload <sha> [каталог]          apps/client/dist → releases/{sha}/, неизменяемо
  check <sha>                     Release check: ассеты релиза отдаются с CDN
  image <image_ref> <sha>         образ скачивается анонимно и помечен этим SHA
  published <sha>                 состояние Release SHA: опубликован, draft или нет
  register <sha> <image_ref>      опубликовать GitHub Release release-<sha> с архивами
  artifacts [release-<sha>]      Release для CD; пусто — последний готовый по истории origin/main
  import                          разовый перенос двух выпусков прода в Releases
  confirmed                       последний подтверждённый выпуск прода по истории
  target                          цель отката по истории production
  start <sha> <image_ref> <deploy|rollback>   запись production до переключения (RELEASE_ID)
  finish <deployment_id> <success|failure|error>   итог записи production
  health <sha>                    Health check: прод отдаёт выпуск через BFF
  retention                       удалить старые ассеты
  direction <deploy|rollback> <sha>       проверить направление от RELEASE_BEFORE_SHA
  board <publish|deploy|rollback> <sha>    карточки операции; deploy/rollback требуют RELEASE_DEPLOYMENT_ID
  board-recover <deployment_id>    восстановить карточки исходной операции, без выкатки
  report <publish|deploy|rollback> <sha>    полный отчёт без Telegram
`;

async function main(command: string | undefined, args: string[]): Promise<void> {
    switch (command) {
        case 'report':
            if (args.length !== 2) throw new ReleaseError(USAGE);
            return reportRelease(args[0]!, checkSha(args[1]), process.cwd());
        case 'direction':
            if (args.length !== 2 || (args[0] !== 'deploy' && args[0] !== 'rollback'))
                throw new ReleaseError(USAGE);
            return assertReleaseDirection(
                args[0],
                process.env.RELEASE_BEFORE_SHA ?? '',
                checkSha(args[1]),
                process.cwd(),
            );
        case 'board-recover':
        case 'board': {
            const recovery = command === 'board-recover';
            if (
                recovery
                    ? args.length !== 1
                    : args.length !== 2 || !['publish', 'deploy', 'rollback'].includes(args[0]!)
            )
                throw new ReleaseError(USAGE);
            const kind = args[0] as ReleaseKind;
            let result: BoardResult;
            try {
                if (recovery) {
                    result = await recoverReleaseBoard(
                        /^[1-9][0-9]*$/.test(args[0]!) ? Number(args[0]) : NaN,
                    );
                } else {
                    const sha = checkSha(args[1]);
                    result = await updateReleaseBoard(
                        kind,
                        await readOperationReport(kind, sha),
                        process.env.RELEASE_DEPLOYMENT_ID === undefined
                            ? undefined
                            : Number(process.env.RELEASE_DEPLOYMENT_ID),
                    );
                }
            } catch (error) {
                result = {
                    changed: 0,
                    skipped: 0,
                    errors: [error instanceof Error ? error.message : String(error)],
                };
            }
            const message = result.errors.length
                ? 'Обновление карточек не завершено; проверьте ошибки в Summary'
                : 'Карточки обработаны';
            const detail = `${message}\n\nИзменено: ${result.changed}; пропущено: ${result.skipped}\n${result.errors.join('\n')}\n`;
            if (process.env.GITHUB_STEP_SUMMARY)
                appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Карточки выпуска\n\n${detail}`);
            if (result.errors.length) throw new ReleaseError(detail);
            return;
        }
        case 'upload':
            return upload(checkSha(args[0]), args[1]);
        case 'check':
            return releaseCheck(checkSha(args[0]));
        case 'image':
            await checkImage(checkImageRef(args[0]), checkSha(args[1]));
            return;
        case 'published':
            return published(checkSha(args[0]));
        case 'register': {
            const sha = checkSha(args[0]);
            const imageRef = checkImageRef(args[1]);
            /** Ошибка отчёта не отменяет готовность проверенных артефактов: описание неполное */
            const report = await readOperationReport('publish', sha).catch(() => undefined);
            await publishRelease({
                sha,
                imageRef,
                notification: notificationMetadata(),
                body: releaseBody(sha, imageRef, runUrl(), report),
                dist: 'apps/client/dist',
            });
            return;
        }
        case 'artifacts':
            return artifacts(args[0] ?? '');
        case 'import':
            return importReleases();
        case 'confirmed':
            await lastConfirmed();
            return;
        case 'target':
            return rollbackTarget();
        case 'start':
            if (args[2] !== 'deploy' && args[2] !== 'rollback') throw new ReleaseError(USAGE);
            return startProduction(
                checkSha(args[0]),
                checkImageRef(args[1]),
                args[2],
                Number(process.env.RELEASE_ID),
            );
        case 'finish':
            return finishProduction(args[0] ?? '', args[1] ?? '');
        case 'health':
            return health(checkSha(args[0]));
        case 'retention':
            return retention();
        default:
            throw new ReleaseError(USAGE);
    }
}

const [command, ...args] = process.argv.slice(2);
try {
    await main(command, args);
} catch (err) {
    if (!(err instanceof ReleaseError)) throw err;
    console.error(`::error::${err.message}`);
    process.exit(1);
}
