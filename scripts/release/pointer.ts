import { ReleaseError, output } from './env.ts';
import { openBucket, publishIndex, readCurrent, writeCurrent } from './s3.ts';

/** Сделать релиз текущим */
export async function promote(sha: string): Promise<void> {
    const bucket = openBucket();
    const current = await readCurrent(bucket);
    // повторная выкатка того же релиза previous не трогает, иначе откатываться будет некуда
    const previous = current?.stable === sha ? current.previous : (current?.stable ?? null);
    // сначала index.html, потом указатель: атомарной записи двух объектов в S3 нет,
    // при падении между шагами отстаёт указатель, а не сайт
    await publishIndex(bucket, sha);
    await writeCurrent(bucket, { stable: sha, previous });
    console.log(`stable: ${sha}, previous: ${previous}`);
}

/** Sha релиза previous — того, на который вернёт откат; попадает в выход шага sha */
export async function findPrevious(): Promise<string> {
    const current = await readCurrent(openBucket());
    if (!current) throw new ReleaseError('current.json нет — откатываться некуда');
    if (!current.previous)
        throw new ReleaseError('В current.json нет previous — откатываться некуда');
    output('sha', current.previous);
    console.log(`previous: ${current.previous}`);
    return current.previous;
}

/** Вернуть релиз previous: stable и previous меняются местами */
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
