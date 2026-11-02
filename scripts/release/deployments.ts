// Готовые выпуски (release-artifacts) и история прода (production) — в GitHub Deployments. S3 хранит
// только ассеты, указателя релиза и release.json нет.
import { ReleaseError, output } from './env.ts';
import {
    ARTIFACTS_ENV,
    PRODUCTION_ENV,
    type ArtifactsPayload,
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

function notificationMetadata(): NotificationMetadata {
    const base = process.env.RELEASE_REPORT_BASE_SHA;
    const report = process.env.RELEASE_REPORT_URL;
    const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
    if (!Number.isSafeInteger(attempt) || attempt <= 0)
        throw new ReleaseError('Некорректный номер попытки Actions run');
    if (report && report !== `${runUrl()}#summary`)
        throw new ReleaseError('URL отчёта вне текущего Actions run');
    return {
        base_sha: base ? checkSha(base) : null,
        report_url: report || null,
        run_attempt: attempt,
    };
}

/** Каталог ассетов релиза в S3 и на CDN. */
export const assetsOf = (sha: string): string => `releases/${sha}/`;

/**
 * Единственный готовый выпуск SHA среди записей `release-artifacts`: успешная запись `publish` с
 * образом BFF по digest. Неоднозначность (несколько успешных с разными образами) — ошибка.
 * @param records записи этого SHA
 * @param sha полный SHA
 * @returns payload выпуска или undefined, если готового выпуска нет
 */
export function readyArtifacts(
    records: Deployment<ArtifactsPayload>[],
    sha: string,
): ArtifactsPayload | undefined {
    const ready = records.filter((record) => record.sha === sha && record.state === 'success');
    const refs = new Set(ready.map((record) => record.payload?.image_ref));
    if (refs.size > 1) {
        throw new ReleaseError(
            `У ${sha} несколько готовых выпусков с разными образами: ${[...refs]}`,
        );
    }
    const payload = ready[0]?.payload;
    if (!payload) return undefined;
    checkImageRef(payload.image_ref);
    if (payload.assets !== assetsOf(sha)) {
        throw new ReleaseError(`У ${sha} в release-artifacts каталог ${payload.assets}`);
    }
    return payload;
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
 * Готовый выпуск SHA из `release-artifacts`; выходы шага `image_ref` и `assets`.
 * @param sha полный SHA
 * @returns payload выпуска
 */
export async function artifacts(sha: string): Promise<ArtifactsPayload> {
    const payload = readyArtifacts(await listDeployments(ARTIFACTS_ENV, sha), sha);
    if (!payload) {
        throw new ReleaseError(
            `Готового выпуска ${sha} нет в release-artifacts: CI этого коммита не опубликовал образ ` +
                'и ассеты или ещё идёт. Частично опубликованный выпуск не выкатывается',
        );
    }
    output('image_ref', payload.image_ref);
    output('assets', payload.assets);
    console.log(`Готовый выпуск ${sha}: ${payload.image_ref}, ${payload.assets}`);
    return payload;
}

/**
 * Опубликован ли уже выпуск SHA: повторный CI его не пересобирает. Выход шага `published`.
 * @param sha полный SHA
 */
export async function published(sha: string): Promise<void> {
    const payload = readyArtifacts(await listDeployments(ARTIFACTS_ENV, sha), sha);
    output('published', payload ? 'true' : 'false');
    if (payload) output('image_ref', payload.image_ref);
    console.log(
        payload ? `Выпуск ${sha} уже опубликован: ${payload.image_ref}` : `Выпуска ${sha} ещё нет`,
    );
}

/**
 * Регистрирует готовый выпуск после проверки образа и ассетов. Успешная запись одна на SHA:
 * другой образ того же SHA отклоняется.
 * @param sha полный SHA
 * @param imageRef образ BFF по digest
 */
export async function register(sha: string, imageRef: string): Promise<void> {
    checkImageRef(imageRef);
    const existing = readyArtifacts(await listDeployments(ARTIFACTS_ENV, sha), sha);
    if (existing) {
        if (existing.image_ref === imageRef) {
            console.log(`Выпуск ${sha} уже зарегистрирован с ${imageRef}`);
            return;
        }
        throw new ReleaseError(
            `Выпуск ${sha} уже опубликован с ${existing.image_ref}; другой образ ${imageRef} не принимается`,
        );
    }
    const payload: ArtifactsPayload = {
        image_ref: imageRef,
        assets: assetsOf(sha),
        ci_run: runUrl(),
        notification: notificationMetadata(),
    };
    const id = await createDeployment({
        environment: ARTIFACTS_ENV,
        sha,
        task: 'publish',
        payload,
    });
    await setDeploymentState(id, 'success', 'Образ и ассеты опубликованы и проверены');
    console.log(`release-artifacts ${id}: ${sha} → ${imageRef}`);
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
    // цель сверяется с готовым выпуском: тот же образ по digest
    const ready = readyArtifacts(await listDeployments(ARTIFACTS_ENV, target.sha), target.sha);
    if (ready?.image_ref !== target.imageRef) {
        throw new ReleaseError(
            `Цель отката ${target.sha} (${target.imageRef}) не совпадает с release-artifacts ` +
                `(${ready?.image_ref ?? 'нет готового выпуска'})`,
        );
    }
    output('sha', target.sha);
    output('image_ref', target.imageRef);
    console.log(
        `Последняя попытка: ${target.last.sha} (${target.last.state}); цель отката: ${target.sha} → ${target.imageRef}`,
    );
}

/**
 * Запись production до переключения BFF; выход `deployment_id`. Статус — in_progress.
 * @param sha полный SHA выбранного образа
 * @param imageRef образ по digest
 * @param action deploy или rollback
 */
export async function startProduction(
    sha: string,
    imageRef: string,
    action: ProductionPayload['action'],
): Promise<void> {
    const payload: ProductionPayload = {
        image_ref: checkImageRef(imageRef),
        assets: assetsOf(sha),
        action,
        run: runUrl(),
        notification: notificationMetadata(),
    };
    const id = await createDeployment({ environment: PRODUCTION_ENV, sha, task: action, payload });
    await setDeploymentState(
        id,
        'in_progress',
        `${action === 'deploy' ? 'Выкатка' : 'Откат'} ${sha}`,
    );
    output('deployment_id', String(id));
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
