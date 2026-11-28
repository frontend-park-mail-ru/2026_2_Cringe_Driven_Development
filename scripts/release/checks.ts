import { ReleaseError, cdnUrl, siteUrl } from './env.ts';

const TIMEOUT_MS = 10_000;
const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 5000);
/** Сколько ждать прод: после переключения Caddy и BFF отвечают не сразу. */
const HEALTH_WAIT_MS = Number(process.env.HEALTH_WAIT_MS || 120_000);
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

/**
 * Вход со случайными данными доходит до Go: только его отказ `invalid_credentials` подтверждает
 * BFF, S2S и обработчик входа. Такой логин не создаёт ни пользователя, ни сессии.
 */
async function checkGo(site: string): Promise<void> {
    const url = `${site}/api/auth/login`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF': '1', Origin: site },
        body: JSON.stringify({
            login: `health_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
            password: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => undefined)) as
        | { error?: { code?: string; appCode?: string } }
        | undefined;
    const { code, appCode } = body?.error ?? {};
    if (res.status !== 400 || code !== 'BAD_REQUEST' || appCode !== 'invalid_credentials') {
        throw new Error(
            `${url}: ${res.status} ${code ?? ''} ${appCode ?? ''}, нужен отказ Go invalid_credentials`,
        );
    }
}

/** Страница прода этого выпуска: `Cache-Control: private, no-store` и `<meta name="release">` SHA. */
async function releasePage(url: string, sha: string): Promise<string> {
    const page = await get(url, { Accept: 'text/html' });
    if (page.headers.get('cache-control') !== 'private, no-store') {
        throw new Error(`${url}: Cache-Control='${page.headers.get('cache-control') ?? ''}'`);
    }
    const html = await page.text();
    if (releaseOf(html) !== sha) {
        throw new Error(`${url}: release='${releaseOf(html) ?? ''}', ждём '${sha}'`);
    }
    return html;
}

async function healthOnce(sha: string): Promise<string> {
    const site = siteUrl();
    const base = `${cdnUrl()}/releases/${sha}/`;
    /** Гостю HTML отдаёт `/login`: защищённые страницы ведут его туда редиректом BFF. */
    const html = await releasePage(`${site}/login`, sha);
    const bootstraps = [
        ...html.matchAll(/<script id="bootstrap" type="application\/json">([^<]*)<\/script>/g),
    ];
    if (bootstraps.length !== 1 || bootstraps[0]![1] !== '{"user":null}') {
        throw new Error(`${site}/login: нужен ровно один bootstrap {"user":null}`);
    }
    // вложенный адрес админки OnlineConf: её HTML этого выпуска, не продукта
    const admin = await releasePage(`${site}/onlineconf/keys`, sha);
    if (admin.includes('id="bootstrap"')) throw new Error(`${site}/onlineconf/keys: HTML продукта`);
    const assets =
        (await checkAssets(html, base, `${site}/login`)) +
        (await checkAssets(admin, base, `${site}/onlineconf/keys`));
    const me = await fetch(`${site}/api/users/me`, {
        headers: { 'X-CSRF': '1' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await me.json().catch(() => undefined)) as
        | { error?: { code?: string } }
        | undefined;
    if (me.status !== 401 || body?.error?.code !== 'UNAUTHORIZED') {
        throw new Error(`${site}/api/users/me без сессии: ${me.status}, нужен UNAUTHORIZED`);
    }
    const unknown = await fetch(`${site}/api/unknown`, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await unknown.body?.cancel();
    if (
        unknown.status !== 404 ||
        (unknown.headers.get('content-type') ?? '').includes('text/html')
    ) {
        throw new Error(`${site}/api/unknown: ${unknown.status}, нужен 404 не HTML`);
    }
    await checkGo(site);
    return `JS и CSS (файлов: ${assets})`;
}

/**
 * Прод отдаёт выпуск через BFF: гостевой HTML с одним bootstrap и релизом SHA, HTML админки OnlineConf
 * на `/onlineconf/keys`, их JS и CSS с CDN,
 * UNAUTHORIZED API без сессии, 404 не HTML на неизвестном /api и отказ Go `invalid_credentials` на
 * вход со случайными данными. Выполняется после переключения; образ, healthy и внутренний
 * `/health` проверяет Ansible (`deploy-bff.yml`).
 */

export async function health(sha: string): Promise<void> {
    const deadline = Date.now() + HEALTH_WAIT_MS;
    for (;;) {
        try {
            const assets = await healthOnce(sha);
            console.log(`OK: ${siteUrl()} отдаёт выпуск ${sha} через BFF, ${assets} с CDN`);
            return;
        } catch (err) {
            console.log(message(err));
        }
        if (Date.now() + INTERVAL_MS > deadline) break;
        await Bun.sleep(INTERVAL_MS);
    }
    throw new ReleaseError(`Health check не прошёл: ${siteUrl()} не отдаёт выпуск ${sha}`);
}
