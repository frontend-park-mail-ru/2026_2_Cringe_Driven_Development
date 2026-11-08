import { ReleaseError } from './env.ts';

/** Публичный образ BFF: выкатывается только он и только по digest. */
export const BFF_IMAGE = 'ghcr.io/cringe-driven-development-team/bff';

const MANIFEST_TYPES = [
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/**
 * Проверяет ссылку на образ BFF: только `ghcr.io/cringe-driven-development-team/bff@sha256:<64 hex>`.
 * @param ref ссылка из аргумента или payload
 * @returns та же ссылка
 */
export function checkImageRef(ref: string | undefined): string {
    if (!ref || !new RegExp(`^${RegExp.escape(BFF_IMAGE)}@sha256:[0-9a-f]{64}$`).test(ref)) {
        throw new ReleaseError(`Ожидается ${BFF_IMAGE}@sha256:<64 hex>, получено: '${ref ?? ''}'`);
    }
    return ref;
}

interface Manifest {
    mediaType?: string;
    manifests?: { digest: string; platform?: { os?: string; architecture?: string } }[];
    config?: { digest: string };
}

/**
 * Метка `org.opencontainers.image.revision` и config digest (image ID Docker) linux/amd64 образа
 * GHCR, прочитанные анонимно — без учётных данных, как его скачивает VPS. Приватный package или
 * неизвестный digest — ReleaseError.
 * @param ref ссылка `ghcr.io/<имя>@sha256:<digest>`
 * @returns метка (или пустая строка) и config digest
 */
export async function imageConfig(ref: string): Promise<{ revision: string; imageId: string }> {
    const [name, digest] = ref.replace(/^ghcr\.io\//, '').split('@') as [string, string];
    const registry = 'https://ghcr.io';
    const tokenRes = await fetch(
        `${registry}/token?service=ghcr.io&scope=repository:${name}:pull`,
        { signal: AbortSignal.timeout(20_000) },
    );
    if (!tokenRes.ok) {
        throw new ReleaseError(
            `GHCR не выдал анонимный токен для ${name}: ${tokenRes.status}. Package bff должен быть публичным`,
        );
    }
    const { token } = (await tokenRes.json()) as { token?: string };
    const headers = { Authorization: `Bearer ${token ?? ''}`, Accept: MANIFEST_TYPES };
    const get = async (path: string): Promise<Response> => {
        const res = await fetch(`${registry}/v2/${name}/${path}`, {
            headers,
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
            throw new ReleaseError(
                `${ref} не скачивается анонимно: ${path} → ${res.status}. ` +
                    'Package bff должен быть публичным, digest — опубликованным',
            );
        }
        return res;
    };

    const top = await get(`manifests/${digest}`);
    const served = top.headers.get('docker-content-digest');
    if (served && served !== digest) {
        throw new ReleaseError(`GHCR вернул манифест ${served} вместо ${digest}`);
    }
    let manifest = (await top.json()) as Manifest;
    if (manifest.manifests) {
        const image = manifest.manifests.find(
            (item) => item.platform?.os === 'linux' && item.platform.architecture === 'amd64',
        );
        if (!image) throw new ReleaseError(`В ${ref} нет образа linux/amd64`);
        manifest = (await (await get(`manifests/${image.digest}`)).json()) as Manifest;
    }
    if (!manifest.config) throw new ReleaseError(`У ${ref} нет config: это не образ`);
    const config = (await (await get(`blobs/${manifest.config.digest}`)).json()) as {
        config?: { Labels?: Record<string, string> };
    };
    return {
        revision: config.config?.Labels?.['org.opencontainers.image.revision'] ?? '',
        imageId: manifest.config.digest,
    };
}

/**
 * Образ BFF скачивается анонимно и принадлежит релизу: без учётных данных GHCR отдаёт его манифест
 * по digest, а метка `org.opencontainers.image.revision` равна SHA. Так же скачивает образ и VPS.
 * @param ref ссылка по digest
 * @param sha полный SHA релиза
 * @returns config digest образа (image ID Docker)
 */
export async function checkImage(ref: string, sha: string): Promise<string> {
    const { revision, imageId } = await imageConfig(checkImageRef(ref));
    if (revision !== sha) {
        throw new ReleaseError(
            `${ref}: org.opencontainers.image.revision='${revision}', нужен '${sha}'`,
        );
    }
    console.log(`OK: ${ref} скачивается анонимно, релиз ${sha}`);
    return imageId;
}

/**
 * Config digest из `Config` манифеста `docker image save`: `<hex>.json` (классический формат) или
 * `blobs/sha256/<hex>` (OCI-layout).
 * @param config значение поля Config
 * @returns `sha256:<hex>` или undefined
 */
export function configDigestOf(config: string | undefined): string | undefined {
    const hex = /(?:^|\/)([0-9a-f]{64})(?:\.json)?$/.exec(config ?? '')?.[1];
    return hex && `sha256:${hex}`;
}
