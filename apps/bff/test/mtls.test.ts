import { afterAll, beforeAll, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer, type TLSSocket } from 'node:tls';

import { createGoFetch } from '../src/go/fetch.ts';
import { loadGoTls } from '../src/go/tls.ts';

let directory: string;
const file = (name: string) => join(directory, name);
const openssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' });

function ca(name: string): void {
    openssl(
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-keyout',
        file(`${name}.key`),
        '-out',
        file(`${name}.crt`),
        '-days',
        '2',
        '-subj',
        `/CN=${name}`,
        '-addext',
        'basicConstraints=critical,CA:TRUE',
    );
}

function leaf(name: string, issuer: string, extension: string, expired = false): void {
    const subject = extension === 'clientAuth' ? 'cellestial-bff' : name;
    openssl(
        'req',
        '-new',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-keyout',
        file(`${name}.key`),
        '-out',
        file(`${name}.csr`),
        '-subj',
        `/CN=${subject}`,
    );
    const ext = file(`${name}.ext`);
    writeFileSync(ext, `extendedKeyUsage=${extension}\n`);
    if (expired) {
        const caConfig = file('ca.cnf');
        writeFileSync(file('index.txt'), '');
        writeFileSync(file('serial'), '01\n');
        writeFileSync(
            caConfig,
            [
                '[ca]',
                'default_ca = test',
                '[test]',
                `database = ${file('index.txt')}`,
                `serial = ${file('serial')}`,
                `new_certs_dir = ${directory}`,
                `certificate = ${file(`${issuer}.crt`)}`,
                `private_key = ${file(`${issuer}.key`)}`,
                'default_md = sha256',
                'policy = subject',
                '[subject]',
                'commonName = supplied',
            ].join('\n'),
        );
        openssl(
            'ca',
            '-batch',
            '-config',
            caConfig,
            '-in',
            file(`${name}.csr`),
            '-out',
            file(`${name}.crt`),
            '-startdate',
            '20010101000000Z',
            '-enddate',
            '20010102000000Z',
            '-extfile',
            ext,
        );
        return;
    }
    openssl(
        'x509',
        '-req',
        '-in',
        file(`${name}.csr`),
        '-CA',
        file(`${issuer}.crt`),
        '-CAkey',
        file(`${issuer}.key`),
        '-CAcreateserial',
        '-out',
        file(`${name}.crt`),
        '-days',
        '1',
        '-extfile',
        ext,
    );
}

beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'bff-tls-'));
    ca('trusted');
    ca('foreign');
    leaf('valid', 'trusted', 'serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost');
    leaf('wrong-san', 'trusted', 'serverAuth\nsubjectAltName=IP:127.0.0.2,DNS:other.invalid');
    leaf('foreign-server', 'foreign', 'serverAuth\nsubjectAltName=IP:127.0.0.1');
    leaf('expired', 'trusted', 'serverAuth\nsubjectAltName=IP:127.0.0.1', true);
    leaf('client', 'trusted', 'clientAuth');
    leaf('renewed', 'trusted', 'clientAuth');
});

afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
});

function config(client = 'client'): NodeJS.ProcessEnv {
    return {
        NODE_ENV: 'production',
        GO_API_TLS_CA_FILE: file('trusted.crt'),
        GO_API_TLS_CERT_FILE: file(`${client}.crt`),
        GO_API_TLS_KEY_FILE: file(`${client}.key`),
    };
}

async function fixture(certificate: string) {
    const requests: {
        path: string | undefined;
        key: string | undefined;
        bearer: string | undefined;
        requestId: string | undefined;
        peer: string | undefined;
        serial: string | undefined;
    }[] = [];
    const sockets = new Set<TLSSocket>();
    const server = createServer(
        {
            key: readFileSync(file(`${certificate}.key`)),
            cert: readFileSync(file(`${certificate}.crt`)),
            ca: readFileSync(file('trusted.crt')),
            requestCert: true,
            rejectUnauthorized: true,
        },
        (socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            socket.on('error', () => socket.destroy());
            const peer = socket.getPeerCertificate();
            let request = '';
            socket.on('data', (chunk: Buffer) => {
                request += chunk.toString();
                const headerEnd = request.indexOf('\r\n\r\n');
                if (headerEnd < 0) return;
                const [line, ...fields] = request.slice(0, headerEnd).split('\r\n');
                const headers = new Headers(
                    fields.map((field) => {
                        const colon = field.indexOf(':');
                        return [field.slice(0, colon), field.slice(colon + 1).trim()];
                    }),
                );
                requests.push({
                    path: line?.split(' ')[1],
                    key: headers.get('x-bff-key') ?? undefined,
                    bearer: headers.get('authorization') ?? undefined,
                    requestId: headers.get('x-request-id') ?? undefined,
                    peer: typeof peer.subject?.CN === 'string' ? peer.subject.CN : undefined,
                    serial: peer.serialNumber,
                });
                socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok');
            });
        },
    );
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as AddressInfo).port;
    return {
        ip: new URL(`https://127.0.0.1:${port}/api/v1`),
        dns: new URL(`https://localhost:${port}/api/v1`),
        requests,
        close: () => {
            for (const socket of sockets) socket.destroy();
            server.close();
        },
    };
}

test('production needs HTTPS and all readable TLS files', () => {
    const https = new URL('https://127.0.0.1/api/v1');
    expect(loadGoTls(https, config())).toBeDefined();
    expect(() => loadGoTls(new URL('http://127.0.0.1/api/v1'), config())).toThrow('GO_API_URL');
    expect(() => loadGoTls(https, { NODE_ENV: 'production' })).toThrow('GO_API_TLS_CA_FILE');
    expect(() => loadGoTls(https, { ...config(), GO_API_TLS_KEY_FILE: '' })).toThrow(
        'GO_API_TLS_KEY_FILE',
    );
    expect(() =>
        loadGoTls(https, { ...config(), GO_API_TLS_KEY_FILE: file('missing-secret-path') }),
    ).toThrow(/^Неверная конфигурация: GO_API_TLS_KEY_FILE$/);
    expect(() =>
        loadGoTls(https, { ...config(), GO_API_TLS_KEY_FILE: file('renewed.key') }),
    ).toThrow('GO_API_TLS_CERT_FILE, GO_API_TLS_KEY_FILE');
    expect(() =>
        loadGoTls(https, { ...config(), GO_API_URL_TLS_SERVER_NAME: '127.0.0.2' }),
    ).toThrow('GO_API_URL_TLS_SERVER_NAME');
});

test('login, refresh and Bearer requests carry client identity and original headers', async () => {
    const upstream = await fixture('valid');
    try {
        const go = createGoFetch(upstream.ip.href, 'test-key', loadGoTls(upstream.ip, config()));
        for (const [method, path, bearer] of [
            ['POST', '/auth/login', undefined],
            ['POST', '/auth/refresh', undefined],
            ['GET', '/users/me', 'Bearer test-token'],
        ] as const) {
            const headers = new Headers({ 'X-Request-ID': 'request-42' });
            if (bearer) headers.set('Authorization', bearer);
            expect(await (await go(path, { method, headers })).text()).toBe('ok');
        }
        expect(upstream.requests).toEqual(
            ['/auth/login', '/auth/refresh', '/users/me'].map((path, index) => ({
                path: `/api/v1${path}`,
                key: 'test-key',
                bearer: index === 2 ? 'Bearer test-token' : undefined,
                requestId: 'request-42',
                peer: 'cellestial-bff',
                serial: expect.any(String),
            })),
        );
        const renewed = createGoFetch(
            upstream.dns.href,
            'test-key',
            loadGoTls(upstream.dns, config('renewed')),
        );
        expect(await (await renewed('/users/me', { method: 'GET' })).text()).toBe('ok');
        expect(upstream.requests.at(-1)?.serial).not.toEqual(upstream.requests[0]?.serial);
    } finally {
        upstream.close();
    }
});

for (const certificate of ['foreign-server', 'expired', 'wrong-san']) {
    test(`rejects ${certificate} with no HTTP fallback`, async () => {
        const upstream = await fixture(certificate);
        try {
            for (const url of [upstream.ip, upstream.dns]) {
                const go = createGoFetch(url.href, 'test-key', loadGoTls(url, config()));
                await expect(go('/users/me', { method: 'GET' })).rejects.toThrow();
            }
            expect(upstream.requests).toHaveLength(0);
        } finally {
            upstream.close();
        }
    });
}

test('an SSH tunnel validates the IP SAN of the server behind loopback', async () => {
    const upstream = await fixture('wrong-san');
    try {
        const tls = loadGoTls(upstream.ip, {
            ...config(),
            NODE_ENV: 'development',
            GO_API_URL_TLS_SERVER_NAME: '127.0.0.2',
        });
        const go = createGoFetch(upstream.ip.href, 'test-key', tls);
        expect(await (await go('/users/me', { method: 'GET' })).text()).toBe('ok');
    } finally {
        upstream.close();
    }
});

test('Workspace uses its own endpoint and an Identity TLS error keeps the session cookie', async () => {
    const upstream = await fixture('wrong-san');
    const workspace = await fixture('valid');
    const processEnv = {
        ...config(),
        APP_ORIGIN: 'https://example.test',
        IDENTITY_API_URL: upstream.ip.href,
        WORKSPACE_API_URL: workspace.dns.href,
        BFF_KEY: 'test-key',
        SESSION_KEY: Buffer.alloc(32).toString('base64'),
    };
    const previous = Object.keys(processEnv).map((name) => [name, process.env[name]] as const);
    Object.assign(process.env, processEnv);
    try {
        const { workspaceRequest } = await import('../src/go/request.ts');
        await workspaceRequest('POST', '/notebooks/{id}/clone', {
            params: { path: { id: 42 } },
            init: {
                headers: { Authorization: 'Bearer test-access', 'X-Request-ID': 'workspace-42' },
            },
        });
        expect(workspace.requests).toEqual([
            expect.objectContaining({
                path: '/api/v1/notebooks/42/clone',
                key: 'test-key',
                bearer: 'Bearer test-access',
                requestId: 'workspace-42',
                peer: 'cellestial-bff',
            }),
        ]);
        const { serveRoute } = await import('../src/http.ts');
        const { users } = await import('../src/router/users.ts');
        const { SESSION_COOKIE } = await import('../src/session/cookies.ts');
        const { sealSession } = await import('../src/session/crypto.ts');
        const now = Math.floor(Date.now() / 1000);
        const session = await sealSession({
            access: 'test-access',
            refresh: 'test-refresh',
            accessExp: now + 600,
            refreshExp: now + 1200,
        });
        const route = users.find((item) => item.path === '/api/users/me')!;
        const response = await serveRoute(
            route,
            new Request('https://example.test/api/users/me', {
                headers: { Cookie: `${SESSION_COOKIE}=${session}`, 'X-CSRF': '1' },
            }),
        );
        expect(response.status).toBe(502);
        expect(await response.json()).toMatchObject({ error: { code: 'BAD_GATEWAY' } });
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(response.headers.get('X-Request-ID')).toBeTruthy();
        expect(upstream.requests).toEqual([]);
        expect(workspace.requests).toHaveLength(1);
    } finally {
        for (const [name, value] of previous) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        workspace.close();
        upstream.close();
    }
});
