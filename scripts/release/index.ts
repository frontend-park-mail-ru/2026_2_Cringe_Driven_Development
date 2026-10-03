// Выкатка клиента в S3, по команде на шаг workflow. Раскладка бакета:
//   releases/{sha}/ — сборка клиента, неизменяемая;
//   index.html      — копия index.html текущего релиза, его отдаёт Caddy;
//   current.json    — { "stable": "{sha}", "previous": "{sha}" }, пишет только CI.
import { health, releaseCheck } from './checks.ts';
import { ReleaseError, checkSha } from './env.ts';
import { notify } from './notify.ts';
import { findPrevious, promote, rollback } from './pointer.ts';
import { retention } from './retention.ts';
import { upload } from './upload.ts';

const USAGE = `Использование: bun run release <команда>
  upload <sha> [каталог]   dist → releases/{sha}/
  check <sha>              Release check: релиз отдаётся с CDN
  promote <sha>            сделать релиз текущим
  previous                 sha релиза, на который вернёт откат
  rollback <sha>           вернуть релиз previous
  health <sha>             Health check: сайт отдаёт релиз
  retention                удалить старые релизы
  notify <Выкатка|Откат> <success|failure|cancelled> [sha]`;

async function main(command: string | undefined, args: string[]): Promise<void> {
    switch (command) {
        case 'upload':
            return upload(checkSha(args[0]), args[1]);
        case 'check':
            return releaseCheck(checkSha(args[0]));
        case 'promote':
            return promote(checkSha(args[0]));
        case 'previous':
            await findPrevious();
            return;
        case 'rollback':
            return rollback(checkSha(args[0]));
        case 'health':
            return health(checkSha(args[0]));
        case 'retention':
            return retention();
        case 'notify':
            if (!args[0] || !args[1]) throw new ReleaseError(USAGE);
            return notify(args[0], args[1], args[2]);
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
