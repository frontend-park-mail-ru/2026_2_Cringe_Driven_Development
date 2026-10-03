import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ReleaseError } from './env.ts';
import { IMMUTABLE, NO_CACHE, openBucket, putObject } from './s3.ts';

// Content-Type задаём сами: чанк с чужим типом браузер как модуль не выполнит
const TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
};
const PARALLEL = 8;

/** dist → releases/{sha}/ */
export async function upload(sha: string, dir = 'dist'): Promise<void> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
        .map((file) => file.replaceAll('\\', '/'));
    if (!files.includes('index.html')) {
        throw new ReleaseError(`В ${dir} нет index.html — сборка не выполнена`);
    }

    const bucket = openBucket();
    const put = async (file: string, cacheControl: string): Promise<void> => {
        const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
        const body = await readFile(join(dir, file));
        await putObject(bucket, `releases/${sha}/${file}`, body, type, cacheControl);
    };

    const assets = files.filter((file) => file !== 'index.html');
    for (let i = 0; i < assets.length; i += PARALLEL) {
        await Promise.all(assets.slice(i, i + PARALLEL).map((file) => put(file, IMMUTABLE)));
    }
    // index.html — последним: релиз с index.html загружен целиком
    await put('index.html', NO_CACHE);
    console.log(
        `Релиз ${sha} загружен в s3://${bucket.name}/releases/${sha}/: ${files.length} файлов`,
    );
}
