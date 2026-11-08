import { env } from '../env.ts';
import { GoError } from './errors.ts';

const GO_TIMEOUT_MS = 5000;

/**
 * Мутатор клиента Go, сгенерированного Orval (`orval.config.ts`): дописывает адрес Go
 * (`GO_API_URL`) к пути операции, ставит таймаут 5 с и `X-BFF-Key` (если задан `BFF_KEY`) и
 * отдаёт ответ в форме клиента. `Authorization` и `X-Request-ID` передаёт вызывающий код. Таймаут
 * и сетевой сбой — `GoError` вида `timeout` и `network`.
 * @param path путь операции из контракта Go, например `/notebooks/1/cells`
 * @returns статус, заголовки и тело ответа (JSON, иначе текст; без тела — `undefined`)
 */
export const bearerFetch = async <T>(path: string, init: RequestInit): Promise<T> => {
    const headers = new Headers(init.headers);
    if (env.BFF_KEY) headers.set('X-BFF-Key', env.BFF_KEY);
    const timeout = AbortSignal.timeout(GO_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

    let response: Response;
    let text: string;
    try {
        response = await fetch(`${env.GO_API_URL}${path}`, { ...init, headers, signal });
        text = await response.text();
    } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'TimeoutError' || name === 'AbortError') {
            throw new GoError('timeout', `Go не ответил за ${GO_TIMEOUT_MS} мс`);
        }
        throw new GoError('network', 'Go недоступен');
    }

    let data: unknown;
    if (text !== '') {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }
    return { data, status: response.status, headers: response.headers } as T;
};
