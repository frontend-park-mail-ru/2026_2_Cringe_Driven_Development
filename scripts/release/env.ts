import { appendFileSync } from 'node:fs';

/** Ошибка шага выкатки: печатается аннотацией GitHub Actions, шаг завершается с кодом 1 */
export class ReleaseError extends Error {}

export function need(name: string): string {
    const value = process.env[name];
    if (!value) throw new ReleaseError(`Не задана переменная ${name}`);
    return value;
}

export function checkSha(sha: string | undefined): string {
    if (!sha || !isSha(sha))
        throw new ReleaseError(`Ожидается sha коммита, получено: '${sha ?? ''}'`);
    return sha;
}

export function isSha(value: string): boolean {
    return /^[0-9a-f]{40}$/.test(value);
}

function baseUrl(value: string): string {
    return (/^https?:\/\//.test(value) ? value : `https://${value}`).replace(/\/+$/, '');
}

export function cdnUrl(): string {
    return baseUrl(need('CDN_URL'));
}

export function siteUrl(): string {
    return baseUrl(process.env.SITE_URL || 'https://cellestial.ru');
}

/** Выход шага workflow; вне GitHub Actions ничего не делает */
export function output(name: string, value: string): void {
    const file = process.env.GITHUB_OUTPUT;
    if (file) appendFileSync(file, `${name}=${value}\n`);
}
