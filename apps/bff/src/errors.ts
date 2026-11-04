import { TRPCError } from '@trpc/server';

import { GoError } from './go/errors.ts';
import { SessionEnded } from './session/refresh.ts';

/** Причина ошибки tRPC с машинным кодом для клиента — уходит в `data.appCode`. */
export class AppCodeError extends Error {
    readonly appCode: string;

    /**
     * @param appCode машинный код: `csrf_invalid` или `code` из ответа Go
     */
    constructor(appCode: string) {
        super(appCode);
        this.name = 'AppCodeError';
        this.appCode = appCode;
    }
}

type Code = TRPCError['code'];

const HTTP_CODES: Record<number, Code> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
};

const fromGo = (err: GoError): TRPCError => {
    // 403 s2s_forbidden — сбой между BFF и Go, а не запрет пользователю
    const mapped =
        err.kind === 'http' && err.code !== 's2s_forbidden'
            ? HTTP_CODES[err.status ?? 0]
            : undefined;
    return new TRPCError({
        code: mapped ?? 'BAD_GATEWAY',
        message: mapped ? err.message : 'Go недоступен или ответил с ошибкой',
        cause: err.code ? new AppCodeError(err.code) : undefined,
    });
};

/**
 * Переводит ошибку процедуры в ответ tRPC: `SessionEnded` — `UNAUTHORIZED`, `GoError` — по статусу
 * Go (400, 401, 403, 404, 409, 413, 415), а `403 s2s_forbidden`, 5xx, сеть, таймаут и ответ не того вида —
 * `BAD_GATEWAY`. Прочие ошибки tRPC остаются как есть.
 * @param e ошибка процедуры или её обёртка tRPC
 * @returns ошибка tRPC
 */
export function toTrpcError(e: unknown): TRPCError {
    const cause = e instanceof TRPCError && e.cause ? e.cause : e;
    if (cause instanceof SessionEnded)
        return new TRPCError({ code: 'UNAUTHORIZED', message: 'Нет сессии' });
    if (cause instanceof GoError) return fromGo(cause);
    if (e instanceof TRPCError) return e;
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: e });
}

/**
 * Машинный код ошибки для `data.appCode`.
 * @param error ошибка tRPC
 * @returns код или `undefined`
 */
export function appCodeOf(error: TRPCError): string | undefined {
    return error.cause instanceof AppCodeError ? error.cause.appCode : undefined;
}
