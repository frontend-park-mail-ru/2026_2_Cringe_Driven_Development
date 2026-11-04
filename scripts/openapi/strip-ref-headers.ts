import { defineTransformer } from 'orval';

// shortcut: обход экспорта Apidog — он пишет `headers: {}` к каждому ответу, и рядом с `$ref`
// это запрещено OpenAPI; удалить, когда Apidog перестанет выгружать такие headers (frontend#149)
/** Удаляет пустые `headers` у ответов-ссылок `$ref`, остальные ответы не трогает. */
export const stripRefHeaders = defineTransformer((spec) => {
    for (const path of Object.values(spec.paths ?? {})) {
        for (const operation of Object.values(path ?? {})) {
            if (
                typeof operation !== 'object' ||
                operation === null ||
                !('responses' in operation)
            ) {
                continue;
            }
            for (const response of Object.values(operation.responses ?? {})) {
                const headers: unknown = response.headers;
                if (
                    '$ref' in response &&
                    typeof headers === 'object' &&
                    headers !== null &&
                    Object.keys(headers).length === 0
                ) {
                    delete response.headers;
                }
            }
        }
    }
    return spec;
});
