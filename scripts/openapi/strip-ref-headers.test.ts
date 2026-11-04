import { expect, test } from 'bun:test';
import type { OpenApiDocument } from 'orval';
import { stripRefHeaders } from './strip-ref-headers.ts';

test('удаляет только пустые headers у ответов-ссылок', async () => {
    const etag = { ETag: { schema: { type: 'string' } } };
    const spec = {
        openapi: '3.1.0',
        info: { title: 't', version: '1' },
        paths: {
            '/a': {
                get: {
                    responses: {
                        '200': { description: 'ok', headers: {} },
                        '201': { description: 'ok', headers: etag },
                        '400': { $ref: '#/components/responses/BadRequest', headers: {} },
                        '409': { $ref: '#/components/responses/Conflict', headers: etag },
                    },
                },
            },
        },
    } as unknown as OpenApiDocument;

    const responses: Record<string, unknown> =
        (await stripRefHeaders(spec)).paths?.['/a']?.get?.responses ?? {};

    expect(responses['200']).toEqual({ description: 'ok', headers: {} });
    expect(responses['201']).toEqual({ description: 'ok', headers: etag });
    expect(responses['400']).toEqual({ $ref: '#/components/responses/BadRequest' });
    expect(responses['409']).toEqual({ $ref: '#/components/responses/Conflict', headers: etag });
});
