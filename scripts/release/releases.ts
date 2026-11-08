// Каталог готовых выпусков — GitHub Releases: один immutable Release на полный SHA, тег
// release-<sha>, ровно четыре asset. Машиночитаемый состав — release.json; описание Release
// редактируемое и доказательством не считается. Порядок публикации: draft → assets → publish.
import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distArchive, imageArchive } from './archives.ts';
import { readTrustedRun } from './catalog.ts';
import { ReleaseError, checkSha, isSha, need, output } from './env.ts';
import { api, runUrl, type NotificationMetadata } from './github.ts';
import { checkImage, checkImageRef } from './image.ts';

const DIST_ASSET = 'frontend-dist.tar.gz';
const IMAGE_ASSET = 'bff-image.tar.gz';
const MANIFEST_ASSET = 'release.json';
const SUMS_ASSET = 'SHA256SUMS';
/** Файлы, суммы которых перечислены в SHA256SUMS, в порядке строк. */
const SUMMED = [DIST_ASSET, IMAGE_ASSET, MANIFEST_ASSET];
const ASSETS = [...SUMMED, SUMS_ASSET];
/** Лимит GitHub на asset; размер должен быть строго меньше. */
export const MAX_ASSET_SIZE = 2 * 1024 ** 3;
/** release.json и SHA256SUMS скачиваются для проверки; бинарные архивы — нет. */
const SMALL_ASSET = 64 * 1024;

/** Состав и происхождение выпуска: asset `release.json`. */
export interface ReleaseManifest {
    sha: string;
    image_ref: string;
    image_id: string;
    assets: string;
    ci_run: string;
    ci_run_attempt: number;
    publication_run: string;
    notification: NotificationMetadata;
}

/** Asset Release в форме GitHub API. */
export interface ReleaseAsset {
    id: number;
    name: string;
    size: number;
    state: string;
    digest: string | null;
}

/** Release в форме GitHub API: нужные проверке поля. */
export interface GitHubRelease {
    id: number;
    tag_name: string;
    target_commitish: string;
    draft: boolean;
    prerelease: boolean;
    immutable?: boolean;
    html_url: string;
    upload_url: string;
    assets: ReleaseAsset[];
}

/** Каталог ассетов выпуска в S3 и на CDN. */
export const assetsOf = (sha: string): string => `releases/${sha}/`;
/** Тег выпуска. */
export const tagOf = (sha: string): string => `release-${sha}`;

/** SHA из точного тега `release-<полный SHA>`. */
export function shaOfTag(tag: string | undefined): string {
    const match = /^release-([0-9a-f]{40})$/.exec(tag ?? '');
    if (!match)
        throw new ReleaseError(`Ожидается тег release-<полный SHA>, получено: '${tag ?? ''}'`);
    return match[1]!;
}

/** SHA-256 в hex. */
export function sha256(data: Uint8Array | string): string {
    return new Bun.CryptoHasher('sha256').update(data).digest('hex');
}

/** SHA-256 файла потоком: архивы бывают до 2 GiB. */
export async function fileSha256(path: string): Promise<string> {
    const hasher = new Bun.CryptoHasher('sha256');
    for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
    return hasher.digest('hex');
}

/** Номер попытки текущего Actions run. */
export function runAttempt(): number {
    const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
    if (!Number.isSafeInteger(attempt) || attempt <= 0)
        throw new ReleaseError('Некорректный номер попытки Actions run');
    return attempt;
}

/** Id run из URL Actions этого репозитория; другие адреса не принимаются. */
export function runIdOf(url: unknown): number {
    const prefix = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${need('GITHUB_REPOSITORY')}/actions/runs/`;
    const id = typeof url === 'string' && url.startsWith(prefix) ? url.slice(prefix.length) : '';
    if (!/^[1-9][0-9]*$/.test(id))
        throw new ReleaseError(`Адрес вне Actions репозитория: '${url}'`);
    return Number(id);
}

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[], what: string): void {
    if (Object.keys(value).toSorted().join() !== keys.toSorted().join())
        throw new ReleaseError(`${what}: ожидаются ровно поля ${keys.join(', ')}`);
}

const positive = (value: unknown): boolean =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const fail = (field: string) => new ReleaseError(`release.json: некорректное поле ${field}`);

/**
 * Проверяет release.json без сети: точный набор полей, SHA, образ по digest, каталог CDN, URL
 * только Actions этого репозитория.
 * @param value разобранный JSON
 * @param sha полный SHA выпуска
 * @returns проверенный manifest
 */
export function checkManifest(value: unknown, sha: string): ReleaseManifest {
    if (!object(value)) throw new ReleaseError('release.json: ожидается объект');
    exactKeys(
        value,
        [
            'sha',
            'image_ref',
            'image_id',
            'assets',
            'ci_run',
            'ci_run_attempt',
            'publication_run',
            'notification',
        ],
        'release.json',
    );
    if (value.sha !== sha) throw fail('sha');
    checkImageRef(value.image_ref as string);
    if (typeof value.image_id !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.image_id))
        throw fail('image_id');
    if (value.assets !== assetsOf(sha)) throw fail('assets');
    runIdOf(value.ci_run);
    if (!positive(value.ci_run_attempt)) throw fail('ci_run_attempt');
    runIdOf(value.publication_run);
    const notification = value.notification;
    if (!object(notification)) throw fail('notification');
    exactKeys(notification, ['base_sha', 'report_url', 'run_attempt'], 'release.json notification');
    if (
        notification.base_sha !== null &&
        !(typeof notification.base_sha === 'string' && isSha(notification.base_sha))
    )
        throw fail('notification.base_sha');
    if (
        notification.report_url !== null &&
        notification.report_url !== `${value.publication_run}#summary`
    )
        throw fail('notification.report_url');
    if (!positive(notification.run_attempt)) throw fail('notification.run_attempt');
    return value as unknown as ReleaseManifest;
}

/** SHA256SUMS в формате `sha256sum`: строка на файл, порядок фиксирован. */
export function renderSums(sums: Record<string, string>): string {
    return SUMMED.map((name) => `${sums[name]}  ${name}\n`).join('');
}

/**
 * Разбирает SHA256SUMS: ровно три строки `sha256sum` для трёх файлов выпуска.
 * @param text содержимое
 * @returns hex-суммы по именам
 */
export function parseSums(text: string): Record<string, string> {
    const sums: Record<string, string> = {};
    const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : [text];
    for (const line of lines) {
        const match = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
        if (!match || !SUMMED.includes(match[2]!) || (match[2] as string) in sums)
            throw new ReleaseError(`SHA256SUMS: неожиданная строка '${line}'`);
        sums[match[2]!] = match[1]!;
    }
    if (Object.keys(sums).length !== SUMMED.length)
        throw new ReleaseError(`SHA256SUMS: нужны суммы ${SUMMED.join(', ')}`);
    return sums;
}

/**
 * Все Releases репозитория, включая draft.
 * @returns Releases от новых к старым
 */
export async function listReleases(): Promise<GitHubRelease[]> {
    const result: GitHubRelease[] = [];
    for (let page = 1; ; page++) {
        const batch = await api<GitHubRelease[]>(`/releases?per_page=100&page=${page}`);
        result.push(...batch);
        if (batch.length < 100) return result;
    }
}

/**
 * Release SHA, включая draft (его видит токен с правом записи).
 * @param sha полный SHA
 * @returns Release или undefined
 */
export async function findRelease(sha: string): Promise<GitHubRelease | undefined> {
    const found = (await listReleases()).filter((release) => release.tag_name === tagOf(sha));
    if (found.length > 1)
        throw new ReleaseError(`У ${sha} несколько Releases: выпуск неоднозначен`);
    return found[0];
}

/** Фактический commit тега; аннотированный тег разыменовывается. */
async function tagCommit(tag: string): Promise<string> {
    let ref = (await api<{ object: { sha: string; type: string } }>(`/git/ref/tags/${tag}`)).object;
    if (ref.type === 'tag')
        ref = (await api<{ object: typeof ref }>(`/git/tags/${ref.sha}`)).object;
    if (ref.type !== 'commit') throw new ReleaseError(`Тег ${tag} указывает не на commit`);
    return ref.sha;
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${need('GITHUB_TOKEN')}`,
        'X-GitHub-Api-Version': '2022-11-28',
    };
}

/** Скачивает небольшой asset; ссылка хранилища — без токена GitHub. */
async function downloadAsset(asset: ReleaseAsset): Promise<Uint8Array> {
    if (asset.size > SMALL_ASSET)
        throw new ReleaseError(`${asset.name} больше ${SMALL_ASSET} байт`);
    const base = process.env.GITHUB_API_URL || 'https://api.github.com';
    const signal = AbortSignal.timeout(20_000);
    let res = await fetch(
        `${base}/repos/${need('GITHUB_REPOSITORY')}/releases/assets/${asset.id}`,
        {
            headers: { ...authHeaders(), Accept: 'application/octet-stream' },
            redirect: 'manual',
            signal,
        },
    );
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) res = await fetch(location, { signal });
    if (!res.ok) throw new ReleaseError(`Не скачивается ${asset.name}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length !== asset.size) throw new ReleaseError(`${asset.name}: размер не совпадает`);
    return bytes;
}

/** Asset проверяемого выпуска: ровно один, загружен, размер и digest GitHub. */
function checkAssets(release: GitHubRelease, names: string[]): Map<string, ReleaseAsset> {
    const byName = new Map<string, ReleaseAsset>();
    for (const asset of release.assets) {
        if (!ASSETS.includes(asset.name) || byName.has(asset.name))
            throw new ReleaseError(`${release.tag_name}: лишний или повторный asset ${asset.name}`);
        byName.set(asset.name, asset);
    }
    for (const name of names) {
        const asset = byName.get(name);
        if (!asset || asset.state !== 'uploaded')
            throw new ReleaseError(`${release.tag_name}: нет загруженного ${name}`);
        if (!(asset.size > 0 && asset.size < MAX_ASSET_SIZE))
            throw new ReleaseError(`${release.tag_name}: размер ${name} вне (0, 2 GiB)`);
        if (!/^sha256:[0-9a-f]{64}$/.test(asset.digest ?? ''))
            throw new ReleaseError(`${release.tag_name}: у ${name} нет digest GitHub`);
    }
    return byName;
}

const hexOf = (asset: ReleaseAsset): string => asset.digest!.slice('sha256:'.length);

async function readManifestAsset(asset: ReleaseAsset, sha: string): Promise<ReleaseManifest> {
    const bytes = await downloadAsset(asset);
    if (sha256(bytes) !== hexOf(asset))
        throw new ReleaseError('release.json не совпадает с digest');
    try {
        return checkManifest(JSON.parse(new TextDecoder().decode(bytes)), sha);
    } catch (error) {
        if (error instanceof ReleaseError) throw error;
        throw new ReleaseError('release.json: некорректный JSON');
    }
}

/**
 * Происхождение: сборка — push/main CI этого SHA с попыткой не больше фактической; публикация —
 * тот же run или доверенный разовый импорт. Conclusion workflow не учитывается.
 * @param manifest проверенный без сети manifest
 */
export async function checkSource(manifest: ReleaseManifest): Promise<void> {
    const ci = await readTrustedRun(runIdOf(manifest.ci_run));
    if (
        ci.kind !== 'publish' ||
        ci.url !== manifest.ci_run ||
        ci.sha !== manifest.sha ||
        manifest.ci_run_attempt > ci.attempt
    )
        throw new ReleaseError(`Недоверенный источник сборки ${manifest.sha}`);
    const attempt = manifest.notification.run_attempt;
    if (manifest.publication_run === manifest.ci_run) {
        if (attempt < manifest.ci_run_attempt || attempt > ci.attempt)
            throw new ReleaseError(`Недоверенная попытка публикации ${manifest.sha}`);
        return;
    }
    const publication = await readTrustedRun(runIdOf(manifest.publication_run));
    if (
        publication.kind !== 'import' ||
        publication.url !== manifest.publication_run ||
        attempt > publication.attempt
    )
        throw new ReleaseError(`Недоверенный источник публикации ${manifest.sha}`);
}

/**
 * Полная проверка выпуска без скачивания архивов: состояние Release, фактический SHA тега,
 * комплект и размеры assets, SHA256SUMS против digest GitHub, manifest и его источник.
 * @param release Release из API
 * @param sha полный SHA
 * @param [draft] проверка draft перед publish: тега ещё нет, сверяется target_commitish
 * @returns manifest
 */
export async function verifyRelease(
    release: GitHubRelease,
    sha: string,
    draft = false,
): Promise<ReleaseManifest> {
    const tag = tagOf(checkSha(sha));
    if (release.tag_name !== tag) throw new ReleaseError(`Release ${release.tag_name} — не ${tag}`);
    if (release.prerelease) throw new ReleaseError(`${tag} — prerelease`);
    if (draft) {
        if (!release.draft || release.target_commitish !== sha)
            throw new ReleaseError(`Draft ${tag} не на ${sha}`);
    } else {
        if (release.draft) throw new ReleaseError(`${tag} — draft, выпуск не готов`);
        if (release.immutable !== true)
            throw new ReleaseError(`${tag} не immutable: включите immutable releases`);
        const commit = await tagCommit(tag);
        if (commit !== sha) throw new ReleaseError(`Тег ${tag} указывает на ${commit}`);
    }
    const assets = checkAssets(release, ASSETS);
    const sumsAsset = assets.get(SUMS_ASSET)!;
    const sumsBytes = await downloadAsset(sumsAsset);
    if (sha256(sumsBytes) !== hexOf(sumsAsset))
        throw new ReleaseError('SHA256SUMS не совпадает с digest');
    const sums = parseSums(new TextDecoder().decode(sumsBytes));
    for (const name of SUMMED)
        if (sums[name] !== hexOf(assets.get(name)!))
            throw new ReleaseError(`SHA256SUMS: сумма ${name} не совпадает с digest GitHub`);
    const manifest = await readManifestAsset(assets.get(MANIFEST_ASSET)!, sha);
    await checkSource(manifest);
    return manifest;
}

/**
 * Зафиксированный состав незавершённого draft: его release.json. Без него восстановление
 * автоматически не выполняется.
 */
async function draftManifest(release: GitHubRelease, sha: string): Promise<ReleaseManifest> {
    if (release.prerelease || release.target_commitish !== sha)
        throw new ReleaseError(`Draft ${release.tag_name} не на ${sha}`);
    const asset = checkAssets(release, []).get(MANIFEST_ASSET);
    if (asset?.state !== 'uploaded' || !asset.digest) {
        throw new ReleaseError(
            `Draft ${release.tag_name} (${release.html_url}) без release.json: состав не зафиксирован. ` +
                'Сверьте S3 releases/<sha>/ и образ GHCR, удалите draft вручную и перезапустите CI ' +
                '(docs/release.md, «Восстановление draft»)',
        );
    }
    return readManifestAsset(asset, sha);
}

/** Опубликованный проверенный Release по точному тегу; выход шага для CD и Rollback. */
export async function readyRelease(
    sha: string,
): Promise<{ release: GitHubRelease; manifest: ReleaseManifest }> {
    const release = await api<GitHubRelease>(`/releases/tags/${tagOf(sha)}`).catch(
        (error: unknown) => {
            throw new ReleaseError(
                `Нет опубликованного Release ${tagOf(sha)}: ${error instanceof Error ? error.message : error}`,
            );
        },
    );
    return { release, manifest: await verifyRelease(release, sha) };
}

/**
 * Выбранный Release для CD: проверка до доступа к VPS. Выходы `sha`, `image_ref`, `assets`,
 * `release_id`; SHA передаётся следующим шагам через GITHUB_ENV.
 * @param tag точный тег release-<SHA>
 */
export async function artifacts(tag: string): Promise<void> {
    const sha = shaOfTag(tag);
    const { release, manifest } = await readyRelease(sha);
    output('sha', sha);
    output('image_ref', manifest.image_ref);
    output('assets', manifest.assets);
    output('release_id', String(release.id));
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `SHA=${sha}\n`);
    console.log(`Готовый выпуск ${release.html_url}: ${manifest.image_ref}`);
}

/**
 * Состояние выпуска SHA для CI. Выходы: `published` — проверенный опубликованный Release есть;
 * `build` — Release нет, нужна сборка; `image_ref` — образ опубликованного или draft выпуска.
 * @param sha полный SHA
 */
export async function published(sha: string): Promise<void> {
    const release = await findRelease(sha);
    if (!release) {
        output('published', 'false');
        output('build', 'true');
        console.log(`Выпуска ${sha} ещё нет`);
        return;
    }
    const manifest = release.draft
        ? await draftManifest(release, sha)
        : await verifyRelease(release, sha);
    output('published', release.draft ? 'false' : 'true');
    output('build', 'false');
    output('image_ref', manifest.image_ref);
    console.log(
        release.draft
            ? `Незавершённый draft ${release.html_url}: публикация продолжится с ${manifest.image_ref}`
            : `Выпуск ${release.html_url} уже опубликован и проверен`,
    );
}

/** Загрузка asset; после сбоя состояние читается заново, удаляется только незавершённая загрузка. */
async function uploadAsset(release: GitHubRelease, name: string, path: string): Promise<void> {
    const hex = await fileSha256(path);
    const url = `${release.upload_url.replace(/\{.*\}$/, '')}?name=${encodeURIComponent(name)}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(statSync(path).size),
            },
            body: Bun.file(path),
            signal: AbortSignal.timeout(60 * 60_000),
        });
        if (!res.ok) throw new ReleaseError(`${res.status} ${await res.text()}`);
    } catch (error) {
        const current = (await api<GitHubRelease>(`/releases/${release.id}`)).assets.find(
            (asset) => asset.name === name,
        );
        if (current?.state === 'uploaded' && current.digest === `sha256:${hex}`) return;
        if (current && current.state !== 'uploaded')
            await api(`/releases/assets/${current.id}`, { method: 'DELETE' });
        throw new ReleaseError(
            `Загрузка ${name} не завершена (${error instanceof Error ? error.message : error}); ` +
                'незавершённый asset удалён, перезапустите job',
        );
    }
}

async function deleteAsset(release: GitHubRelease, name: string): Promise<void> {
    const asset = release.assets.find((item) => item.name === name);
    if (asset) await api(`/releases/assets/${asset.id}`, { method: 'DELETE' });
}

/** Параметры публикации выпуска. */
export interface PublishOptions {
    sha: string;
    imageRef: string;
    notification: NotificationMetadata;
    body: string;
    /** Источник исходной сборки; по умолчанию — текущий push/main CI */
    source?: { ci_run: string; ci_run_attempt: number };
    /** Локальный dist; без него клиент берётся из S3 releases/<sha>/ */
    dist?: string;
}

/**
 * Публикует выпуск: проверенный опубликованный — пропускается; draft — завершается с
 * зафиксированным составом; иначе draft на точном SHA → assets → publish. Архивы — из тех же
 * байтов, что в CDN/GHCR.
 * @param options выпуск
 * @returns id опубликованного Release
 */
export async function publishRelease(options: PublishOptions): Promise<number> {
    const sha = checkSha(options.sha);
    const imageRef = checkImageRef(options.imageRef);
    const imageId = await checkImage(imageRef, sha);
    let release = await findRelease(sha);
    if (release && !release.draft) {
        const manifest = await verifyRelease(release, sha);
        if (manifest.image_ref !== imageRef)
            throw new ReleaseError(`${tagOf(sha)} уже опубликован с ${manifest.image_ref}`);
        console.log(`Выпуск ${release.html_url} уже опубликован: пропуск`);
        return release.id;
    }
    let manifest: ReleaseManifest;
    if (release) {
        const prior = await draftManifest(release, sha);
        if (prior.image_ref !== imageRef || prior.image_id !== imageId)
            throw new ReleaseError(`Draft ${tagOf(sha)} зафиксирован с ${prior.image_ref}`);
        if (options.source && options.source.ci_run !== prior.ci_run)
            throw new ReleaseError(`Draft ${tagOf(sha)} собран другим run ${prior.ci_run}`);
        // исходная сборка сохраняется; новая попытка меняет только публикацию
        manifest = { ...prior, publication_run: runUrl(), notification: options.notification };
    } else {
        const source = options.source ?? { ci_run: runUrl(), ci_run_attempt: runAttempt() };
        manifest = {
            sha,
            image_ref: imageRef,
            image_id: imageId,
            assets: assetsOf(sha),
            ci_run: source.ci_run,
            ci_run_attempt: source.ci_run_attempt,
            publication_run: runUrl(),
            notification: options.notification,
        };
    }
    checkManifest(manifest, sha);

    const work = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'release-'));
    try {
        const uploaded = new Set(
            release?.assets
                .filter((asset) => asset.state === 'uploaded')
                .map((asset) => asset.name),
        );
        const files: Record<string, string> = {};
        files[MANIFEST_ASSET] = join(work, MANIFEST_ASSET);
        writeFileSync(files[MANIFEST_ASSET], `${JSON.stringify(manifest, null, 2)}\n`);
        if (!uploaded.has(DIST_ASSET))
            files[DIST_ASSET] = await distArchive(sha, work, options.dist);
        if (!uploaded.has(IMAGE_ASSET))
            files[IMAGE_ASSET] = await imageArchive(sha, imageRef, imageId, work);
        for (const [name, path] of Object.entries(files))
            if (statSync(path).size >= MAX_ASSET_SIZE)
                throw new ReleaseError(`${name} не меньше 2 GiB: публикация остановлена`);

        if (!release) {
            release = await api<GitHubRelease>('/releases', {
                method: 'POST',
                body: JSON.stringify({
                    tag_name: tagOf(sha),
                    target_commitish: sha,
                    name: `Frontend ${sha.slice(0, 7)}`,
                    body: options.body,
                    draft: true,
                    prerelease: false,
                }),
            });
        } else {
            await api(`/releases/${release.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ body: options.body }),
            }).catch(() => console.warn('::warning::Не удалось обновить описание draft'));
            await deleteAsset(release, SUMS_ASSET);
            await deleteAsset(release, MANIFEST_ASSET);
        }
        // release.json — первым: после него состав draft зафиксирован
        await uploadAsset(release, MANIFEST_ASSET, files[MANIFEST_ASSET]);
        for (const name of [DIST_ASSET, IMAGE_ASSET])
            if (files[name]) await uploadAsset(release, name, files[name]);

        release = await api<GitHubRelease>(`/releases/${release.id}`);
        const assets = checkAssets(release, SUMMED);
        for (const [name, path] of Object.entries(files))
            if (hexOf(assets.get(name)!) !== (await fileSha256(path)))
                throw new ReleaseError(`${name}: digest GitHub не совпадает с локальным файлом`);
        const sums = Object.fromEntries(SUMMED.map((name) => [name, hexOf(assets.get(name)!)]));
        writeFileSync(join(work, SUMS_ASSET), renderSums(sums));
        await uploadAsset(release, SUMS_ASSET, join(work, SUMS_ASSET));
        release = await api<GitHubRelease>(`/releases/${release.id}`);
        await verifyRelease(release, sha, true);

        try {
            await api(`/releases/${release.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ draft: false, make_latest: 'true' }),
            });
        } catch (error) {
            // таймаут или обрыв: итог определяет повторное чтение Release
            console.warn(
                `::warning::Publish без ответа: ${error instanceof Error ? error.message : error}`,
            );
        }
        const { release: ready } = await readyRelease(sha);
        output('release_id', String(ready.id));
        console.log(`Опубликован ${ready.html_url}`);
        return ready.id;
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}
