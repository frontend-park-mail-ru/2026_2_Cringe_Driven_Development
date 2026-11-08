import { env } from '../env.ts';
import { SESSION_COOKIE } from './cookies.ts';

/** Содержимое сессии: токены Go и их сроки — unix-секунды. */
export type SessionData = {
    access: string;
    refresh: string;
    accessExp: number;
    refreshExp: number;
};

const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Имя cookie как AAD: сессию нельзя переложить в cookie с другим назначением. */
const aad = new TextEncoder().encode(SESSION_COOKIE);
const key = crypto.subtle.importKey('raw', env.sessionKey, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
]);

/**
 * Шифрует сессию AES-256-GCM ключом `SESSION_KEY` с новым случайным IV.
 * @returns `base64url(iv ‖ ciphertext ‖ tag)` — значение cookie
 */
export async function sealSession(data: SessionData): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plain = new TextEncoder().encode(JSON.stringify(data));
    const sealed = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key, plain),
    );
    const out = new Uint8Array(IV_BYTES + sealed.length);
    out.set(iv);
    out.set(sealed, IV_BYTES);
    return Buffer.from(out).toString('base64url');
}

const isSessionData = (value: unknown): value is SessionData => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.access === 'string' &&
        typeof v.refresh === 'string' &&
        Number.isFinite(v.accessExp) &&
        Number.isFinite(v.refreshExp)
    );
};

/**
 * Расшифровывает сессию. Любая ошибка разбора, проверки тега или формы — `null`: это отсутствие
 * сессии, а не сбой.
 * @param value значение cookie
 */
export async function openSession(value: string): Promise<SessionData | null> {
    if (!/^[\w-]+$/.test(value)) return null;
    const raw = new Uint8Array(Buffer.from(value, 'base64url'));
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    try {
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: raw.subarray(0, IV_BYTES), additionalData: aad },
            await key,
            raw.subarray(IV_BYTES),
        );
        const data: unknown = JSON.parse(new TextDecoder().decode(plain));
        return isSessionData(data) ? data : null;
    } catch {
        return null;
    }
}
