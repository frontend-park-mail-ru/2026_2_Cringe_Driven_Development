import { protectedReleases } from './deployments.ts';
import { isSha } from './env.ts';
import { PRODUCTION_ENV, type ProductionPayload, listDeployments } from './github.ts';
import { deleteObject, listObjects, openBucket } from './s3.ts';

const KEEP_RELEASES = 5;

/**
 * Оставляет {@link KEEP_RELEASES} последних релизов и, независимо от возраста, ассеты последнего
 * успешного выпуска прода и предыдущего успешного с другим digest (история GitHub Deployments).
 * Если последняя попытка выкатки не success, очистка откладывается: попытка могла переключить
 * контейнер.
 */
export async function retention(): Promise<void> {
    const keep = protectedReleases(await listDeployments<ProductionPayload>(PRODUCTION_ENV));
    if (!keep) {
        console.log('Последняя выкатка не подтверждена — очистка отложена до следующего успеха');
        return;
    }
    const bucket = openBucket();

    /** Релизы по SHA; возраст релиза — время последней записи в его каталог */
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
        .filter(([sha]) => !keep.includes(sha));
    for (const [sha, { keys }] of old) {
        console.log(`Удаляем релиз ${sha}`);
        // index.html — первым: недоудалённый релиз не выглядит целым
        const index = `releases/${sha}/index.html`;
        for (const key of keys.toSorted((a, b) => Number(b === index) - Number(a === index))) {
            await deleteObject(bucket, key);
        }
    }
    console.log(
        `Сохранены последние ${KEEP_RELEASES} релизов и выпуски прода: ${keep.join(', ') || 'нет'}`,
    );
}
