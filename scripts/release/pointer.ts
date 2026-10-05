import { ReleaseError, output } from './env.ts';
import { hasRelease, openBucket, publishIndex, readCurrent, writeCurrent } from './s3.ts';

function git(...args: string[]): boolean {
    return Bun.spawnSync(['git', ...args], { stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
}

function isAncestor(ancestor: string, commit: string): boolean {
    return git('merge-base', '--is-ancestor', ancestor, commit);
}

// выкатка идёт только вперёд по истории main. Иначе previous укажет на более новый релиз,
// и следующий Rollback «откатит» вперёд
function checkForward(stable: string, sha: string): void {
    if (isAncestor(stable, sha)) return;
    for (const [name, commit] of [
        ['stable', stable],
        ['релиза', sha],
    ]) {
        if (!git('cat-file', '-e', `${commit}^{commit}`)) {
            throw new ReleaseError(
                `Коммита ${name} ${commit} нет в истории репозитория: force-push в main ` +
                    'или checkout без fetch-depth: 0',
            );
        }
    }
    if (isAncestor(sha, stable)) {
        throw new ReleaseError(`${sha} старше stable ${stable} — для отката есть Rollback`);
    }
    throw new ReleaseError(
        `stable ${stable} — не предок ${sha}: истории разошлись, выкатка идёт только вперёд по main`,
    );
}

/**
 * Релиз есть в бакете; выполняется до Release check, чтобы ошибка была понятнее, чем 404 с CDN.
 * @param {string} sha sha релиза
 */
export async function exists(sha: string): Promise<void> {
    if (!(await hasRelease(openBucket(), sha))) {
        throw new ReleaseError(
            `Релиза ${sha} нет в бакете: не залит или удалён retention. ` +
                'Перезалейте — перезапустите CI этого коммита в main',
        );
    }
    console.log(`OK: релиз ${sha} есть в бакете`);
}

/**
 * Сделать релиз текущим.
 * @param {string} sha sha релиза
 */
export async function promote(sha: string): Promise<void> {
    const bucket = openBucket();
    const current = await readCurrent(bucket);
    if (current) checkForward(current.stable, sha);
    // повторная выкатка того же релиза previous не трогает, иначе откатываться будет некуда
    const previous = current?.stable === sha ? current.previous : (current?.stable ?? null);
    // сначала index.html, потом указатель: атомарной записи двух объектов в S3 нет,
    // при падении между шагами отстаёт указатель, а не сайт
    await publishIndex(bucket, sha);
    await writeCurrent(bucket, { stable: sha, previous });
    console.log(`stable: ${sha}, previous: ${previous}`);
}

/**
 * Sha релиза previous — того, на который вернёт откат; попадает в выход шага sha.
 * @returns {Promise<string>} sha релиза previous
 */
export async function findPrevious(): Promise<string> {
    const current = await readCurrent(openBucket());
    if (!current) throw new ReleaseError('current.json нет — откатываться некуда');
    if (!current.previous)
        throw new ReleaseError('В current.json нет previous — откатываться некуда');
    output('sha', current.previous);
    console.log(`previous: ${current.previous}`);
    return current.previous;
}

/**
 * Вернуть релиз previous: stable и previous меняются местами.
 * @param {string} sha sha релиза previous
 */
export async function rollback(sha: string): Promise<void> {
    const bucket = openBucket();
    const current = await readCurrent(bucket);
    // откатываемся ровно на тот релиз, который прошёл Release check
    if (current?.previous !== sha) {
        throw new ReleaseError(
            `previous в current.json — ${current?.previous ?? null}, а не ${sha}`,
        );
    }
    await publishIndex(bucket, sha);
    await writeCurrent(bucket, { stable: sha, previous: current.stable });
    console.log(`stable: ${sha}, previous: ${current.stable}`);
}
