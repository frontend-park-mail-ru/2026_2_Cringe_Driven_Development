// Разовый перенос в Releases двух выпусков прода: последнего подтверждённого и предыдущего
// успешного с другим digest. Источник — прежние записи production/release-artifacts и сохранённые
// S3/GHCR; без пересборки и без массового импорта истории (docs/release.md, «Импорт»).
import { readTrustedRun } from './catalog.ts';
import { releaseCheck } from './checks.ts';
import { protectedReleases } from './deployments.ts';
import { ReleaseError } from './env.ts';
import { PRODUCTION_ENV, listDeployments, type ProductionPayload } from './github.ts';
import {
    assetsOf,
    findRelease,
    publishRelease,
    runAttempt,
    runIdOf,
    verifyRelease,
} from './releases.ts';
import { releaseBody } from './report.ts';

/** Прежний каталог готовых выпусков; читается только этим переносом. */
const ARTIFACTS_ENV = 'release-artifacts';

interface ArtifactsPayload {
    image_ref: string;
    assets: string;
    ci_run: string;
}

/**
 * Переносит выбранные выпуски; уже опубликованный Release перепроверяется и пропускается.
 * Расхождение источника останавливает перенос до публикации.
 */
export async function importReleases(): Promise<void> {
    const history = await listDeployments<ProductionPayload>(PRODUCTION_ENV);
    const keep = protectedReleases(history);
    if (!keep?.length)
        throw new ReleaseError('Нет подтверждённого production или последняя попытка не success');
    for (const sha of keep) {
        const existing = await findRelease(sha);
        if (existing && !existing.draft) {
            await verifyRelease(existing, sha);
            console.log(`${sha}: Release уже опубликован и проверен`);
            continue;
        }
        const ready = (await listDeployments<ArtifactsPayload>(ARTIFACTS_ENV, sha)).filter(
            (record) => record.sha === sha && record.state === 'success',
        );
        const payload = ready[0]?.payload;
        if (!payload || ready.some((record) => record.payload?.image_ref !== payload.image_ref))
            throw new ReleaseError(`${sha}: нет однозначной записи release-artifacts`);
        if (payload.assets !== assetsOf(sha))
            throw new ReleaseError(`${sha}: в release-artifacts каталог ${payload.assets}`);
        const production = history.filter(
            (record) => record.sha === sha && record.state === 'success',
        );
        if (production.some((record) => record.payload?.image_ref !== payload.image_ref))
            throw new ReleaseError(`${sha}: образ production не совпадает с release-artifacts`);
        const ci = await readTrustedRun(runIdOf(payload.ci_run));
        if (ci.kind !== 'publish' || ci.sha !== sha || ci.url !== payload.ci_run)
            throw new ReleaseError(`${sha}: недоверенный источник сборки ${payload.ci_run}`);
        await releaseCheck(sha);
        await publishRelease({
            sha,
            imageRef: payload.image_ref,
            source: { ci_run: payload.ci_run, ci_run_attempt: ci.attempt },
            notification: { base_sha: null, report_url: null, run_attempt: runAttempt() },
            body: `${releaseBody(sha, payload.image_ref, payload.ci_run)}\n\nИмпортирован из прежнего каталога release-artifacts.`,
        });
    }
}
