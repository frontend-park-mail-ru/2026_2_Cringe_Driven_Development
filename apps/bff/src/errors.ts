import type { RuntimeSession } from '@cdd/schemas/types';
import type { Issue } from '@cdd/schemas/validate';
import { GoError } from './go/errors.ts';
import { SessionEnded } from './session/refresh.ts';

/** Категория ошибки по HTTP-статусу ответа BFF. */
const CODES = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    412: 'PRECONDITION_FAILED',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    502: 'BAD_GATEWAY',
} as const;

/** HTTP-статус ошибки API. */
export type ErrorStatus = keyof typeof CODES;

/** Категория ошибки API: по ней клиент принимает решения, а не по тексту. */
export type ErrorCode = (typeof CODES)[ErrorStatus];

/** Ошибки полей входа: пустой путь — `formErrors`, остальные — по первому сегменту пути. */
export type ValidationErrors = { formErrors: string[]; fieldErrors: Record<string, string[]> };

/** Тело ответа с ошибкой API. */
export type ApiErrorBody = {
    error: {
        code: ErrorCode;
        message: string;
        /** Машинный код: `csrf_invalid` или `code` из ответа Go */
        appCode?: string;
        validationErrors?: ValidationErrors;
        /** Занятая сессия из `409 active_session_exists` */
        activeRuntimeSession?: RuntimeSession;
    };
};

/** Ошибка обработки запроса API с HTTP-статусом и полями ответа. */
export class ApiError extends Error {
    readonly status: ErrorStatus;
    readonly appCode?: string;
    readonly activeRuntimeSession?: RuntimeSession;
    readonly issues?: Issue[];

    /**
     * @param status HTTP-статус ответа
     * @param message безопасное сообщение для клиента
     * @param details машинный код, занятая сессия, проблемы входа и исходная причина для лога
     */
    constructor(
        status: ErrorStatus,
        message: string,
        details: {
            appCode?: string;
            activeRuntimeSession?: RuntimeSession;
            issues?: Issue[];
            cause?: unknown;
        } = {},
    ) {
        super(message, { cause: details.cause });
        this.name = 'ApiError';
        this.status = status;
        this.appCode = details.appCode;
        this.activeRuntimeSession = details.activeRuntimeSession;
        this.issues = details.issues;
    }

    /** Категория по статусу. */
    get code(): ErrorCode {
        return CODES[this.status];
    }
}

/**
 * Статус Go, который доходит до клиента как есть.
 * @param status статус ответа Go
 */
const isPassed = (status: number | undefined): status is ErrorStatus =>
    status !== undefined && status < 500 && status in CODES;

/**
 * Ошибка API по сбою Go.
 * @param err сбой обращения к Go
 */
const fromGo = (err: GoError): ApiError => {
    /**
     * `403 s2s_forbidden` — сбой между BFF и Go, а не запрет пользователю; `401 invalid_totp` —
     * неверный код 2FA, а не конец сессии: клиент не должен выходить.
     */
    const status =
        err.kind !== 'http' || err.code === 's2s_forbidden'
            ? undefined
            : err.code === 'invalid_totp'
              ? 400
              : isPassed(err.status)
                ? err.status
                : undefined;
    return status
        ? new ApiError(status, err.message, {
              appCode: err.code,
              activeRuntimeSession: err.activeSession,
          })
        : new ApiError(502, 'Go недоступен или ответил с ошибкой', {
              appCode: err.code,
              cause: err,
          });
};

/**
 * Переводит ошибку обработчика в ошибку API: `SessionEnded` — 401, `GoError` — по статусу Go
 * (400, 401, 403, 404, 409, 412, 413, 415, 429; `invalid_totp` — 400), а `403 s2s_forbidden`,
 * 5xx, сеть, таймаут и ответ не того вида — 502. Прочее — 500 без деталей для клиента.
 * @param e пойманная ошибка
 */
export function toApiError(e: unknown): ApiError {
    if (e instanceof ApiError) return e;
    if (e instanceof SessionEnded) return new ApiError(401, 'Нет сессии');
    if (e instanceof GoError) return fromGo(e);
    return new ApiError(500, 'Внутренняя ошибка сервера', { cause: e });
}

/**
 * Ошибки полей из проблем входа; значения входа в них не попадают.
 * @param issues проблемы от проверки входа
 */
function flatten(issues: Issue[]): ValidationErrors {
    const errors: ValidationErrors = { formErrors: [], fieldErrors: {} };
    for (const { path, message } of issues) {
        const [field] = path;
        if (field === undefined) errors.formErrors.push(message);
        else (errors.fieldErrors[String(field)] ??= []).push(message);
    }
    return errors;
}

/**
 * Тело ответа с ошибкой: без стека, входа и внутренних сообщений.
 * @param error ошибка API
 */
export function errorBody(error: ApiError): ApiErrorBody {
    return {
        error: {
            code: error.code,
            message: error.message,
            appCode: error.appCode,
            validationErrors: error.issues && flatten(error.issues),
            activeRuntimeSession: error.activeRuntimeSession,
        },
    };
}
