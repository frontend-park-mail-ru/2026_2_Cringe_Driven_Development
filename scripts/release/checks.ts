import { ReleaseError, cdnUrl, siteUrl } from './env.ts';

const TIMEOUT_MS = 10_000;
const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 5000);
// домен бакета, с которого Caddy берёт index.html, кэширует ответы на 60 секунд
const HEALTH_WAIT_MS = Number(process.env.HEALTH_WAIT_MS || 180_000);
const RELEASE_CHECK_TRIES = 3;

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

async function releaseCheckOnce(sha: string): Promise<string> {
    const cdn = cdnUrl();
    const site = siteUrl();
    const base = `${cdn}/releases/${sha}/`;
    const html = await (await get(`${base}index.html`)).text();
    if (releaseOf(html) !== sha) {
        throw new Error(`${base}index.html: release='${releaseOf(html) ?? ''}', нужен '${sha}'`);
    }
    const chunk = new RegExp(`src="(${RegExp.escape(base)}[^"]*\\.js)"`).exec(html)?.[1];
    if (!chunk) throw new Error(`В ${base}index.html нет чанка с ${base}`);
    // чанки подключены как <script type="module" crossorigin>: без CORS браузер их не выполнит
    const res = await get(chunk, { Origin: site });
    await res.body?.cancel();
    const origin = res.headers.get('access-control-allow-origin');
    if (origin !== '*' && origin !== site) {
        throw new Error(`${chunk}: Access-Control-Allow-Origin='${origin ?? ''}', нужен '${site}'`);
    }
    return chunk;
}

/** Релиз отдаётся с CDN: его index.html и чанк из него. Выполняется до смены указателя */
export async function releaseCheck(sha: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            const chunk = await releaseCheckOnce(sha);
            console.log(`OK: релиз ${sha} отдаётся с CDN, ${chunk} грузится с ${siteUrl()}`);
            return;
        } catch (err) {
            console.log(message(err));
            if (attempt === RELEASE_CHECK_TRIES) break;
            await Bun.sleep(INTERVAL_MS);
        }
    }
    throw new ReleaseError(`Release check не прошёл: релиз ${sha} не отдаётся с CDN`);
}

/** Сайт отдаёт HTML релиза. Выполняется после смены указателя */
export async function health(sha: string): Promise<void> {
    const url = `${siteUrl()}/`;
    const deadline = Date.now() + HEALTH_WAIT_MS;
    for (;;) {
        try {
            const got = releaseOf(await (await get(url)).text());
            if (got === sha) {
                console.log(`OK: ${url} отдаёт релиз ${sha}`);
                return;
            }
            console.log(`${url}: release='${got ?? ''}', ждём '${sha}'`);
        } catch (err) {
            console.log(message(err));
        }
        if (Date.now() + INTERVAL_MS > deadline) break;
        await Bun.sleep(INTERVAL_MS);
    }
    throw new ReleaseError(`Health check не прошёл: ${url} не отдаёт релиз ${sha}`);
}
