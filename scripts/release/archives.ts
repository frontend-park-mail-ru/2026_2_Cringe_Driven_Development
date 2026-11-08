// Архивы выпуска из уже опубликованных байтов: dist клиента (локальный или из S3) и образ BFF
// по digest. Без пересборки; секретов и env в архивах нет.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ReleaseError } from './env.ts';
import { BFF_IMAGE } from './image.ts';
import { listObjects, openBucket, readObject } from './s3.ts';

function run(args: string[], what: string): string {
    const result = Bun.spawnSync(args, { stderr: 'pipe' });
    if (result.exitCode) throw new ReleaseError(`${what}: ${result.stderr.toString().trim()}`);
    return result.stdout.toString().trim();
}

const bash = (script: string, what: string, ...args: string[]): string =>
    run(['bash', '-c', `set -euo pipefail; ${script}`, 'bash', ...args], what);

/** Клиент выпуска из сохранённого каталога S3 releases/<sha>/. */
async function downloadDist(sha: string, dir: string): Promise<void> {
    const bucket = openBucket();
    const prefix = `releases/${sha}/`;
    const keys = (await listObjects(bucket, prefix)).map((item) => item.key);
    if (!keys.includes(`${prefix}index.html`))
        throw new ReleaseError(`В S3 нет полного ${prefix}: архив клиента не собрать`);
    for (const key of keys) {
        const body = await readObject(bucket, key);
        if (!body) throw new ReleaseError(`S3 не отдал ${key}`);
        const path = join(dir, key.slice(prefix.length));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
    }
}

/**
 * `frontend-dist.tar.gz`: всё содержимое dist с относительными путями, детерминированно (GNU tar).
 * Распакованный архив сверяется с исходным каталогом.
 * @param sha полный SHA
 * @param work рабочий каталог
 * @param [dist] локальный dist; без index.html клиент берётся из S3
 * @returns путь архива
 */
export async function distArchive(sha: string, work: string, dist?: string): Promise<string> {
    let dir = dist;
    if (!dir || !existsSync(join(dir, 'index.html'))) {
        dir = join(work, 'dist');
        mkdirSync(dir);
        await downloadDist(sha, dir);
    }
    const out = join(work, 'frontend-dist.tar.gz');
    bash(
        'tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$1" -cf - . | gzip -n > "$2"',
        'Архив клиента',
        dir,
        out,
    );
    const check = join(work, 'dist-check');
    mkdirSync(check);
    run(['tar', '-xzf', out, '-C', check], 'Распаковка архива клиента');
    run(['diff', '-r', dir, check], 'Архив клиента не совпадает с dist');
    return out;
}

/**
 * `bff-image.tar.gz`: gzip `docker image save` образа `sha-<SHA>` по опубликованному digest.
 * Проверки: config в архиве и image ID после `docker load` равны config digest GHCR, метка — SHA.
 * @param sha полный SHA
 * @param imageRef образ по digest
 * @param imageId config digest из GHCR
 * @param work рабочий каталог
 * @returns путь архива
 */
export async function imageArchive(
    sha: string,
    imageRef: string,
    imageId: string,
    work: string,
): Promise<string> {
    const tag = `${BFF_IMAGE}:sha-${sha}`;
    if (Bun.spawnSync(['docker', 'image', 'inspect', tag]).exitCode) {
        run(['docker', 'pull', imageRef], 'docker pull');
        run(['docker', 'tag', imageRef, tag], 'docker tag');
    }
    const inspect = () =>
        run(
            [
                'docker',
                'image',
                'inspect',
                '--format',
                '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}',
                tag,
            ],
            'docker inspect',
        );
    if (inspect() !== `${imageId} ${sha}`)
        throw new ReleaseError(`Локальный ${tag} — не образ ${imageRef} (${imageId})`);
    const out = join(work, 'bff-image.tar.gz');
    bash('docker image save "$1" | gzip -n > "$2"', 'docker save', tag, out);
    const manifest = JSON.parse(bash('tar -xzOf "$1" manifest.json', 'manifest.json', out)) as {
        Config?: string;
    }[];
    if (manifest.length !== 1 || !manifest[0]?.Config?.endsWith(imageId.slice('sha256:'.length)))
        throw new ReleaseError('В архиве образа другой config');
    run(['docker', 'image', 'rm', tag], 'docker rmi');
    bash('gunzip -c "$1" | docker load', 'docker load', out);
    if (inspect() !== `${imageId} ${sha}`)
        throw new ReleaseError('docker load вернул другой image ID или метку SHA');
    return out;
}
