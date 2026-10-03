import { ReleaseError, isSha } from './env.ts';
import { deleteObject, listObjects, openBucket, readCurrent } from './s3.ts';

const KEEP_RELEASES = 5;

/** Оставить KEEP_RELEASES последних релизов; stable и previous не удаляются никогда */
export async function retention(): Promise<void> {
    const bucket = openBucket();
    const current = await readCurrent(bucket);
    if (!current) throw new ReleaseError('current.json нет — без него удалять релизы нельзя');

    // возраст релиза — время последней записи в его каталог
    const releases = new Map<string, { keys: string[]; modified: number }>();
    for (const { key, modified } of await listObjects(bucket, 'releases/')) {
        const dir = key.split('/')[1] ?? '';
        // посторонние ключи (папка из панели, releases/README.txt) — не релизы, их не трогаем
        if (!isSha(dir)) {
            console.log(`Пропускаем ${key}: не релиз`);
            continue;
        }
        const release = releases.get(dir) ?? { keys: [], modified: 0 };
        release.keys.push(key);
        release.modified = Math.max(release.modified, modified);
        releases.set(dir, release);
    }

    const old = [...releases]
        .toSorted(([, a], [, b]) => b.modified - a.modified)
        .slice(KEEP_RELEASES)
        .filter(([sha]) => sha !== current.stable && sha !== current.previous);
    for (const [sha, { keys }] of old) {
        console.log(`Удаляем релиз ${sha}`);
        // index.html — первым: недоудалённый релиз не выглядит целым
        const index = `releases/${sha}/index.html`;
        for (const key of keys.toSorted((a, b) => Number(b === index) - Number(a === index))) {
            await deleteObject(bucket, key);
        }
    }
}
