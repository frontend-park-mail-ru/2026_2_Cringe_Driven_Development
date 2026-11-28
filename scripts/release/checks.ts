import { ReleaseError, cdnUrl, siteUrl } from './env.ts';

const TIMEOUT_MS = 10_000;
const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 5000);
const RELEASE_CHECK_TRIES = 3;
const ASSET_TYPES: Record<string, string[]> = {
    js: ['text/javascript', 'application/javascript'],
    css: ['text/css'],
};

function releaseOf(html: string): string | undefined {
    return /<meta name="release" content="([^"]*)"/.exec(html)?.[1];
}

async function get(url: string, headers?: Record<string, string>): Promise<Response> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${url}: ответ ${res.status}`);
    return res;
}

function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Все JS и CSS из HTML выпуска — с CDN его SHA и грузятся с типом своего вида (HTML с 200 не
 * подходит); JS — с CORS: чанки подключены как `<script type="module" crossorigin>`, без CORS
 * браузер их не выполнит.
 */
async function checkAssets(html: string, base: string, where: string): Promise<number> {
    const site = siteUrl();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(js|css))"/g)].map(([, url, kind]) => ({
        url: url!,
        kind: kind!,
    }));
    if (
        !assets.some(({ kind }) => kind === 'js') ||
        assets.some(({ url }) => !url.startsWith(base))
    ) {
        throw new Error(`${where}: JS и CSS должны идти с ${base}`);
    }
    for (const { url, kind } of assets) {
        const res = await get(url, { Origin: site });
        await res.body?.cancel();
        const type = res.headers.get('content-type') ?? '';
        if (!ASSET_TYPES[kind]!.includes(type.split(';')[0]!.trim().toLowerCase())) {
            throw new Error(
                `${url}: Content-Type='${type}', нужен ${ASSET_TYPES[kind]!.join(' или ')}`,
            );
        }
        const origin = res.headers.get('access-control-allow-origin');
        if (kind === 'js' && origin !== '*' && origin !== site) {
            throw new Error(
                `${url}: Access-Control-Allow-Origin='${origin ?? ''}', нужен '${site}'`,
            );
        }
    }
    return assets.length;
}

/** HTML продукта и админки OnlineConf в каталоге выпуска: обе SPA выходят одним SHA. */
const RELEASE_HTML = ['index.html', 'onlineconf.html'];

async function releaseCheckOnce(sha: string): Promise<number> {
    const base = `${cdnUrl()}/releases/${sha}/`;
    let assets = 0;
    for (const name of RELEASE_HTML) {
        const html = await (await get(`${base}${name}`)).text();
        if (releaseOf(html) !== sha) {
            throw new Error(`${base}${name}: release='${releaseOf(html) ?? ''}', нужен '${sha}'`);
        }
        assets += await checkAssets(html, base, `${base}${name}`);
    }
    return assets;
}

/**
 * Релиз отдаётся с CDN: его index.html, onlineconf.html и все JS и CSS из них. Выполняется после заливки и до
 * переключения: без любого из ассетов прод не меняется.
 */
export async function releaseCheck(sha: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            const assets = await releaseCheckOnce(sha);
            console.log(
                `OK: релиз ${sha} отдаётся с CDN, JS и CSS грузятся с ${siteUrl()} (файлов: ${assets})`,
            );
            return;
        } catch (err) {
            console.log(message(err));
            if (attempt === RELEASE_CHECK_TRIES) break;
            await Bun.sleep(INTERVAL_MS);
        }
    }
    throw new ReleaseError(`Release check не прошёл: релиз ${sha} не отдаётся с CDN`);
}
