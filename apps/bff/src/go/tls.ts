import { createPrivateKey, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkServerIdentity } from 'node:tls';

const files = {
    ca: 'GO_API_TLS_CA_FILE',
    cert: 'GO_API_TLS_CERT_FILE',
    key: 'GO_API_TLS_KEY_FILE',
} as const;

/**
 * Читает ключ и сертификаты при запуске. В локальном SSH-туннеле адрес соединения
 * loopback, а проверяемый IP принадлежит Go-серверу за туннелем.
 * @param url адрес Go
 * @param source переменные окружения
 * @param variable имя переменной с адресом API
 */
export function loadGoTls(
    url: URL,
    source: NodeJS.ProcessEnv,
    variable = 'GO_API_URL',
): BunFetchRequestInitTLS | undefined {
    const production = source.NODE_ENV === 'production';
    const serverNameVariable = `${variable}_TLS_SERVER_NAME`;
    const serverName = source[serverNameVariable];
    const tunnel = !production && url.hostname === '127.0.0.1' && url.protocol === 'https:';
    if (serverName && (!tunnel || !/^[a-z0-9.-]+$/i.test(serverName))) {
        throw new Error(`Неверная конфигурация: ${serverNameVariable}`);
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new Error(`Неверная конфигурация: ${variable}`);
    }
    if (url.protocol !== 'https:') {
        if (
            production ||
            url.protocol !== 'http:' ||
            Object.values(files).some((name) => source[name])
        ) {
            throw new Error(`Неверная конфигурация: ${variable}`);
        }
        return undefined;
    }

    const invalid: string[] = [];
    const tls: BunFetchRequestInitTLS = { rejectUnauthorized: true };
    for (const field of ['ca', 'cert', 'key'] as const) {
        const name = files[field];
        try {
            const path = source[name];
            const pem = path && readFileSync(path, 'utf8');
            if (!pem?.trim()) {
                invalid.push(name);
                continue;
            }
            const validPem =
                field === 'key'
                    ? createPrivateKey(pem).type === 'private'
                    : new X509Certificate(pem).raw.length > 0;
            if (validPem) tls[field] = pem;
            else invalid.push(name);
        } catch {
            invalid.push(name);
        }
    }
    if (invalid.length > 0) throw new Error(`Неверная конфигурация: ${invalid.join(', ')}`);
    if (
        !new X509Certificate(tls.cert as string).checkPrivateKey(
            createPrivateKey(tls.key as string),
        )
    ) {
        throw new Error(`Неверная конфигурация: ${files.cert}, ${files.key}`);
    }
    if (serverName) {
        tls.checkServerIdentity = (_hostname, cert) => checkServerIdentity(serverName, cert);
    }
    return tls;
}
