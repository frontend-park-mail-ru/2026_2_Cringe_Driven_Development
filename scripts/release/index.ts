// Выпуск и выкатка, по команде на шаг workflow. Ассеты клиента — неизменяемые releases/{sha}/ в S3 и
// на CDN; образ BFF — публичный GHCR по digest; готовые выпуски и история прода — GitHub Deployments
// (release-artifacts и production). HTML отдаёт работающий образ BFF, указателя в S3 нет.
import { health, releaseCheck } from './checks.ts';
import {
    artifacts,
    finishProduction,
    lastConfirmed,
    published,
    register,
    rollbackTarget,
    startProduction,
} from './deployments.ts';
import { ReleaseError, checkSha, output } from './env.ts';
import { reconcileBoard } from './sync.ts';
import { checkImage, checkImageRef } from './image.ts';
import { retention } from './retention.ts';
import { upload } from './upload.ts';
import { reportRelease } from './report.ts';

const USAGE = `Использование: bun run release <команда>
  upload <sha> [каталог]          apps/client/dist → releases/{sha}/, неизменяемо
  check <sha>                     Release check: ассеты релиза отдаются с CDN
  image <image_ref> <sha>         образ скачивается анонимно и помечен этим SHA
  published <sha>                 выпуск SHA уже есть в release-artifacts
  register <sha> <image_ref>      записать готовый выпуск в release-artifacts
  artifacts <sha>                 готовый выпуск SHA: image_ref и каталог ассетов
  confirmed                       последний подтверждённый выпуск прода по истории
  target                          цель отката по истории production
  start <sha> <image_ref> <deploy|rollback>   запись production до переключения
  finish <deployment_id> <success|failure|error>   итог записи production
  health <sha>                    Health check: прод отдаёт выпуск через BFF
  retention                       удалить старые ассеты
  sync                            сверить только доску
  report <publish|deploy|rollback> <sha>    полный отчёт без Telegram
`;

async function main(command: string | undefined, args: string[]): Promise<void> {
    switch (command) {
        case 'report':
            if (args.length !== 2) throw new ReleaseError(USAGE);
            return reportRelease(args[0]!, checkSha(args[1]), process.cwd());
        case 'sync': {
            const result = await reconcileBoard(process.cwd());
            output('allowed', String(result.allowed));
            if (result.errors.length) throw new ReleaseError(result.errors.join('\n'));
            return;
        }
        case 'upload':
            return upload(checkSha(args[0]), args[1]);
        case 'check':
            return releaseCheck(checkSha(args[0]));
        case 'image':
            return checkImage(checkImageRef(args[0]), checkSha(args[1]));
        case 'published':
            return published(checkSha(args[0]));
        case 'register':
            return register(checkSha(args[0]), checkImageRef(args[1]));
        case 'artifacts':
            await artifacts(checkSha(args[0]));
            return;
        case 'confirmed':
            await lastConfirmed();
            return;
        case 'target':
            return rollbackTarget();
        case 'start':
            if (args[2] !== 'deploy' && args[2] !== 'rollback') throw new ReleaseError(USAGE);
            return startProduction(checkSha(args[0]), checkImageRef(args[1]), args[2]);
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
