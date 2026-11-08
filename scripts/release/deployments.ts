// История прода (production) — в GitHub Deployments; готовые выпуски — GitHub Releases
// (releases.ts). S3 хранит только ассеты.
import { ReleaseError, output } from './env.ts';
import {
    PRODUCTION_ENV,
    type Deployment,
    type ProductionPayload,
    type NotificationMetadata,
    createDeployment,
    listDeployments,
    runUrl,
    setDeploymentState,
} from './github.ts';
import { checkImageRef } from './image.ts';
import { checkSha } from './env.ts';
import { assetsOf, readyRelease, runAttempt } from './releases.ts';

/** Проверяет локальный граф: выкатка идёт к потомку, откат — к предку; тот же SHA допустим. */
export async function assertReleaseDirection(
    kind: 'deploy' | 'rollback',
    beforeSha: string,
    targetSha: string,
    repoDir: string,
): Promise<void> {
    if (!beforeSha) throw new ReleaseError('Неизвестна база production для проверки направления');
    checkSha(beforeSha);
    checkSha(targetSha);
    const [base, head] = kind === 'deploy' ? [beforeSha, targetSha] : [targetSha, beforeSha];
    const git = Bun.spawnSync(['git', 'merge-base', '--is-ancestor', base, head], { cwd: repoDir });
    if (git.exitCode === 1)
        throw new ReleaseError(
            `Неверное направление ${kind}: ${targetSha} должен быть ${kind === 'deploy' ? 'потомком' : 'предком'} ${beforeSha} или тем же SHA`,
        );
    if (git.exitCode) throw new ReleaseError(`Git: ${git.stderr.toString().trim()}`);
}

/**
 * Данные уведомления текущей операции из RELEASE_REPORT_BASE_SHA, RELEASE_REPORT_URL и попытки run.
 * @returns notification
 */
export function notificationMetadata(): NotificationMetadata {
    const base = process.env.RELEASE_REPORT_BASE_SHA;
    const report = process.env.RELEASE_REPORT_URL;
    const attempt = runAttempt();
    if (report && report !== `${runUrl()}#summary`)
        throw new ReleaseError('URL отчёта вне текущего Actions run');
    return {
        base_sha: base ? checkSha(base) : null,
        report_url: report || null,
        run_attempt: attempt,
    };
}

/** Цель отката, выбранная по истории production. */
export interface RollbackTarget {
    sha: string;
    imageRef: string;
    /** Последняя завершённая попытка — от неё считается откат */
    last: Deployment<ProductionPayload>;
}

const DONE = new Set(['success', 'failure', 'error']);

/**
 * Цель отката по истории `production`, без чтения VPS. Последняя попытка `success` — предыдущий
 * успешный выпуск с другим digest; `failure`/`error` — последний успешный. Незавершённая или
 * неизвестная последняя попытка, нет цели — ошибка до изменений.
 * @param history записи production, от новых к старым
 * @returns цель отката
 */
export function chooseRollbackTarget(history: Deployment<ProductionPayload>[]): RollbackTarget {
    const relevant = history.filter((record) => record.state !== 'inactive');
    const last = relevant[0];
    if (!last) throw new ReleaseError('В истории production нет выкаток — откатываться некуда');
    if (!last.state || !DONE.has(last.state)) {
        throw new ReleaseError(
            `Последняя попытка ${last.sha} в состоянии ${last.state ?? 'без статуса'}: ` +
                'дождитесь её завершения — состояние прода неизвестно',
        );
    }
    const successes = relevant.filter((record) => record.state === 'success');
    const target =
        last.state === 'success'
            ? successes.find((record) => record.payload?.image_ref !== last.payload?.image_ref)
            : successes[0];
    if (!target) {
        throw new ReleaseError(
            last.state === 'success'
                ? `Нет успешного выпуска с другим образом до ${last.sha} — откатываться некуда`
                : 'Успешных выкаток нет — восстанавливать нечего',
        );
    }
    const imageRef = checkImageRef(target.payload?.image_ref);
    // один SHA — один образ: иначе не ясно, какой из образов этого SHA работал
    const conflicting = successes.find(
        (record) => record.sha === target.sha && record.payload?.image_ref !== imageRef,
    );
    if (conflicting) {
        throw new ReleaseError(
            `У ${target.sha} в истории production разные образы — цель неоднозначна`,
        );
    }
    return { sha: target.sha, imageRef, last };
}

/**
 * Каталоги ассетов, которые retention не удаляет из-за истории прода: последнего успешного выпуска
 * и предыдущего успешного с другим digest. Если последняя попытка не `success`, очистка
 * откладывается: попытка могла переключить контейнер.
 * @param history записи production, от новых к старым
 * @returns SHA, ассеты которых сохраняются, или undefined — очистку отложить
 */
export function protectedReleases(history: Deployment<ProductionPayload>[]): string[] | undefined {
    const relevant = history.filter((record) => record.state !== 'inactive');
    if (relevant.length === 0) return [];
    if (relevant[0]?.state !== 'success') return undefined;
    const successes = relevant.filter((record) => record.state === 'success');
    const current = successes[0]!;
    const previous = successes.find(
        (record) => record.payload?.image_ref !== current.payload?.image_ref,
    );
    return [current.sha, ...(previous ? [previous.sha] : [])];
}

/**
 * Последний подтверждённый выпуск прода по истории GitHub; выход шага `before_sha`.
 * @returns SHA или пустая строка
 */
export async function lastConfirmed(): Promise<string> {
    const history = await listDeployments<ProductionPayload>(PRODUCTION_ENV);
    const sha = history.find((record) => record.state === 'success')?.sha ?? '';
    output('before_sha', sha);
    return sha;
}

/**
 * Цель отката по истории production; выходы `sha`, `image_ref` и `before_sha`.
 */
export async function rollbackTarget(): Promise<void> {
    const history = await listDeployments<ProductionPayload>(PRODUCTION_ENV);
    output('before_sha', history.find((record) => record.state === 'success')?.sha ?? '');
    const target = chooseRollbackTarget(history);
    // цель сверяется с Release: старые записи без release_id — по SHA и digest
    const { release, manifest } = await readyRelease(target.sha);
    if (manifest.image_ref !== target.imageRef) {
        throw new ReleaseError(
            `Цель отката ${target.sha} (${target.imageRef}) не совпадает с Release ` +
                `(${manifest.image_ref})`,
        );
    }
    output('sha', target.sha);
    output('image_ref', target.imageRef);
    output('release_id', String(release.id));
    console.log(
        `Последняя попытка: ${target.last.sha} (${target.last.state}); цель отката: ${target.sha} → ${target.imageRef}`,
    );
}

/**
 * Запись production до переключения BFF; выход `deployment_id`. Статус — in_progress.
 * @param sha полный SHA выбранного образа
 * @param imageRef образ по digest
 * @param action deploy или rollback
 * @param releaseId id проверенного GitHub Release выпуска
 */
export async function startProduction(
    sha: string,
    imageRef: string,
    action: ProductionPayload['action'],
    releaseId: number,
): Promise<void> {
    if (!Number.isSafeInteger(releaseId) || releaseId <= 0)
        throw new ReleaseError('Ожидается id Release выпуска');
    const payload: ProductionPayload = {
        image_ref: checkImageRef(imageRef),
        assets: assetsOf(sha),
        action,
        run: runUrl(),
        notification: notificationMetadata(),
        release_id: releaseId,
    };
    const id = await createDeployment({ environment: PRODUCTION_ENV, sha, task: action, payload });
    // до статуса: при его сбое завершающий шаг workflow найдёт запись и поставит ей error
    output('deployment_id', String(id));
    await setDeploymentState(
        id,
        'in_progress',
        `${action === 'deploy' ? 'Выкатка' : 'Откат'} ${sha}`,
    );
    console.log(`production ${id}: ${action} ${sha} → ${imageRef}`);
}

/**
 * Итог записи production: success — только после проверок фактически запущенного выпуска.
 * @param id id записи
 * @param state success, failure или error
 */
export async function finishProduction(id: string, state: string): Promise<void> {
    if (!/^[1-9][0-9]*$/.test(id)) throw new ReleaseError(`Ожидается id записи, получено '${id}'`);
    if (state !== 'success' && state !== 'failure' && state !== 'error') {
        throw new ReleaseError(`Итог записи — success, failure или error, получено '${state}'`);
    }
    const description =
        state === 'success'
            ? 'Образ запущен, healthy; HTML, RPC и ассеты проверены'
            : state === 'failure'
              ? 'Проверка после переключения не прошла'
              : 'Выкатка прервана до проверки результата';
    await setDeploymentState(Number(id), state, description);
}
