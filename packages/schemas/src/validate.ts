// Ручные проверки входов BFF и строительные блоки проверок ответов Go: ограничения, strip/strict
// и пути ошибок. Пределы — из контракта Go (spec/identity и spec/workspace).

import type { RuntimeSession } from './types.ts';

/** Проблема входа: путь до поля и сообщение. */
export type Issue = { path: (string | number)[]; message: string };

/** Итог проверки входа. */
type Validation<T> = { success: true; data: T } | { success: false; issues: Issue[] };

/** Проверка входа целиком: `T` получает обработчик, `Wire` (только тип) передаёт клиент. */
export interface Validator<T, Wire = T> {
    (input: unknown): Validation<T>;
    readonly wire?: Wire;
}

/** Метка «значение не прошло проверку»: отличима от любого значения входа, включая `undefined`. */
const INVALID: unique symbol = Symbol('invalid');

/** Путь до поля: ключи объектов и индексы массивов. */
type Path = (string | number)[];

/** Проверка значения: итог или {@link INVALID}, проблемы дописываются в `issues`. */
export interface Check<T, Wire = T> {
    (value: unknown, path: Path, issues: Issue[]): T | typeof INVALID;
    readonly wire?: Wire;
}

/** Поля объекта: имя — проверка значения. */
type Shape = Record<string, Check<unknown, unknown>>;

/** Тип значения после проверки. */
type Out<C> = C extends Check<infer T, unknown> ? T : never;

/** Тип значения, как его передаёт клиент. */
type WireOf<C> = C extends Check<unknown, infer W> ? W : never;

/** Пересечение типов одним объектом — для читаемых подсказок. */
type Flat<T> = { [K in keyof T]: T[K] } & {};
/** Объект, в котором поле, допускающее `undefined`, необязательно. */
type OptionalUndefined<T> = Flat<
    { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & {
        [K in keyof T as undefined extends T[K] ? K : never]?: T[K];
    }
>;

/** Объект после проверки полей. */
type OutObject<S extends Shape> = OptionalUndefined<{ [K in keyof S]: Out<S[K]> }>;

/** Объект, как его передаёт клиент. */
type WireObject<S extends Shape> = OptionalUndefined<{ [K in keyof S]: WireOf<S[K]> }>;

/**
 * Записывает проблему и помечает значение невалидным.
 * @param issues накопитель проблем
 * @param path путь до поля
 * @param message сообщение без значения входа
 * @returns {@link INVALID}
 */
const fail = (issues: Issue[], path: Path, message: string): typeof INVALID => {
    issues.push({ path, message });
    return INVALID;
};

/**
 * Обычный объект: не `null` и не массив.
 * @param value проверяемое значение
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Включительные пределы числа, длины или количества. */
type Bounds = { min?: number; max?: number };

/**
 * Сообщение о выходе за пределы.
 * @param n проверяемое число
 * @param bounds пределы
 * @returns сообщение или `undefined`, если число в пределах
 */
const outOfBounds = (n: number, { min, max }: Bounds): string | undefined =>
    min !== undefined && n < min
        ? `Не меньше ${min}`
        : max !== undefined && n > max
          ? `Не больше ${max}`
          : undefined;

/**
 * Строка с длиной в UTF-16 единицах, как `z.string().min().max()`, и шаблоном.
 * @param rule пределы длины и шаблон
 */
export const string =
    (rule: Bounds & { pattern?: RegExp } = {}): Check<string> =>
    (value, path, issues) => {
        if (typeof value !== 'string') return fail(issues, path, 'Ожидалась строка');
        if (rule.min !== undefined && value.length < rule.min) {
            return fail(issues, path, `Не короче ${rule.min} символов`);
        }
        if (rule.max !== undefined && value.length > rule.max) {
            return fail(issues, path, `Не длиннее ${rule.max} символов`);
        }
        if (rule.pattern && !rule.pattern.test(value)) {
            return fail(issues, path, 'Недопустимые символы');
        }
        return value;
    };

/**
 * Фабрика числовых проверок: тип и пределы.
 * @param valid допустимо ли число
 * @param message сообщение для значения не того вида
 */
const numeric =
    (valid: (n: number) => boolean, message: string) =>
    (bounds: Bounds = {}): Check<number> =>
    (value, path, issues) => {
        if (typeof value !== 'number' || !valid(value)) return fail(issues, path, message);
        const out = outOfBounds(value, bounds);
        return out ? fail(issues, path, out) : value;
    };

/** Целое в пределах безопасных целых JS, как `z.int()`. */
export const int = numeric(Number.isSafeInteger, 'Ожидалось целое число');

/** Конечное число, как `z.number()`: NaN и Infinity недопустимы. */
export const number = numeric(Number.isFinite, 'Ожидалось число');

/**
 * Одно из перечисленных строковых значений.
 * @param values допустимые значения
 */
export const oneOf =
    <const V extends readonly string[]>(values: V): Check<V[number]> =>
    (value, path, issues) =>
        values.find((v) => v === value) ?? fail(issues, path, `Одно из: ${values.join(', ')}`);

/** UUID по RFC 9562, как `z.uuid()`. */
const UUID =
    /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/** UUID по RFC 9562. */
export const uuid = string({ pattern: UUID });

/**
 * Значение, равное `expected`, как `z.literal()`.
 * @param expected единственное допустимое значение
 */
export const literal =
    <const V extends string | number | boolean>(expected: V): Check<V> =>
    (value, path, issues) =>
        value === expected ? expected : fail(issues, path, `Ожидалось ${String(expected)}`);

/**
 * Открытый объект: любые ключи и значения сохраняются как есть (выводы nbformat, payload событий).
 * @param value проверяемое значение
 * @param path путь до поля
 * @param issues накопитель проблем
 */
export const record: Check<Record<string, unknown>> = (value, path, issues) =>
    isRecord(value) ? value : fail(issues, path, 'Ожидался объект');

/** Дата и время ISO 8601 со смещением или `Z`, как `z.iso.datetime({ offset: true })`. */
const DATETIME =
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

/** Дата и время ISO 8601 со смещением. */
export const datetime = string({ pattern: DATETIME });

/**
 * Абсолютный URL, который разбирает `URL`.
 * @param value проверяемое значение
 * @param path путь до поля
 * @param issues накопитель проблем
 */
export const url: Check<string> = (value, path, issues) =>
    typeof value === 'string' && URL.canParse(value) ? value : fail(issues, path, 'Ожидался URL');

/**
 * Ровно один подходящий вариант, как `oneOf` OpenAPI: ни одного или несколько — ошибка.
 * @param checks проверки вариантов
 */
export const exactlyOne =
    <C extends Check<unknown, unknown>[]>(...checks: C): Check<Out<C[number]>, WireOf<C[number]>> =>
    (value, path, issues) => {
        const matches = checks.map((check) => check(value, path, [])).filter((r) => r !== INVALID);
        if (matches.length === 1) return matches[0] as Out<C[number]>;
        return fail(
            issues,
            path,
            matches.length ? 'Подходит несколько вариантов' : 'Не подходит ни один вариант',
        );
    };

/**
 * Необязательное значение: `undefined` проходит как есть.
 * @param check проверка заданного значения
 */
export const optional =
    <T, W>(check: Check<T, W>): Check<T | undefined, W | undefined> =>
    (value, path, issues) =>
        value === undefined ? undefined : check(value, path, issues);

/**
 * Значение или `null`.
 * @param check проверка значения, кроме `null`
 */
export const nullable =
    <T, W>(check: Check<T, W>): Check<T | null, W | null> =>
    (value, path, issues) =>
        value === null ? null : check(value, path, issues);

/**
 * Логическое значение.
 * @param value проверяемое значение
 * @param path путь до поля
 * @param issues накопитель проблем
 */
export const boolean: Check<boolean> = (value, path, issues) =>
    typeof value === 'boolean' ? value : fail(issues, path, 'Ожидалось true или false');

/**
 * Значение с умолчанием: вместо `undefined` — `fallback`; клиент поле может не передавать.
 * @param check проверка заданного значения
 * @param fallback значение по умолчанию
 */
const withDefault =
    <T, W>(check: Check<T, W>, fallback: T): Check<T, W | undefined> =>
    (value, path, issues) =>
        value === undefined ? fallback : check(value, path, issues);

/**
 * Массив с пределами длины; путь проблемы элемента — с его индексом.
 * @param item проверка элемента
 * @param bounds пределы количества элементов
 */
export const array =
    <T, W>(item: Check<T, W>, bounds: Bounds = {}): Check<T[], W[]> =>
    (value, path, issues) => {
        if (!Array.isArray(value)) return fail(issues, path, 'Ожидался массив');
        const message = outOfBounds(value.length, bounds);
        if (message) return fail(issues, path, `Элементов: ${message.toLowerCase()}`);
        const out: T[] = [];
        let ok = true;
        value.forEach((v: unknown, i) => {
            const r = item(v, [...path, i], issues);
            if (r === INVALID) ok = false;
            else out.push(r);
        });
        return ok ? out : INVALID;
    };

/**
 * Объект по полям. `strip` отбрасывает лишние поля, `strict` считает их ошибкой объекта:
 * опечатка в имени поля не должна молча теряться.
 * @param shape проверки полей
 * @param mode что делать с лишними полями
 */
export const object = <S extends Shape>(
    shape: S,
    mode: 'strip' | 'strict' = 'strip',
): Check<OutObject<S>, WireObject<S>> => {
    const fields = Object.entries(shape);
    return (value, path, issues) => {
        if (!isRecord(value)) return fail(issues, path, 'Ожидался объект');
        const out: Record<string, unknown> = {};
        let ok = true;
        for (const [key, check] of fields) {
            const r = check(value[key], [...path, key], issues);
            if (r === INVALID) ok = false;
            else if (r !== undefined) out[key] = r;
        }
        if (mode === 'strict') {
            const extra = Object.keys(value).filter((key) => !Object.hasOwn(shape, key));
            if (extra.length > 0) {
                fail(issues, path, `Лишние поля: ${extra.join(', ')}`);
                ok = false;
            }
        }
        // каждое поле shape проверено выше: объект собран по OutObject<S>
        return ok ? (out as OutObject<S>) : INVALID;
    };
};

/**
 * Query: значения — строки из `URLSearchParams`, повтор ключа — массив строк. Повтор известного
 * параметра — ошибка: неоднозначное значение не выбирается молча. Лишние параметры отбрасываются.
 * @param shape проверки параметров
 */
const query = <S extends Shape>(shape: S): Check<OutObject<S>, WireObject<S>> => {
    const inner = object(shape);
    return (value, path, issues) => {
        if (isRecord(value)) {
            for (const key of Object.keys(shape)) {
                if (Array.isArray(value[key])) {
                    return fail(issues, [...path, key], 'Параметр передан несколько раз');
                }
            }
        }
        return inner(value, path, issues);
    };
};

/**
 * Целое из строки query целиком: без частичного разбора, `1e2`, `0x10` и пробелов.
 * @param bounds пределы значения
 */
const intParam = (bounds: Bounds = {}): Check<number> => {
    const check = int(bounds);
    return (value, path, issues) => {
        return typeof value === 'string' && /^-?\d+$/.test(value)
            ? check(Number(value), path, issues)
            : fail(issues, path, 'Ожидалось целое число');
    };
};

/**
 * Проверка входа целиком из проверки значения: успех — только без единой проблемы.
 * @param check проверка корня входа
 */
export const validator =
    <T, W>(check: Check<T, W>): Validator<T, W> =>
    (input) => {
        const issues: Issue[] = [];
        const data = check(input, [], issues);
        return data === INVALID || issues.length > 0
            ? { success: false, issues }
            : { success: true, data };
    };

/** Логин по контракту Go: 3–32 символа a–z, A–Z, 0–9 и `_`; одно правило для регистрации, входа и профиля. */
export const LOGIN = { min: 3, max: 32, pattern: /^[a-zA-Z0-9_]+$/ } as const;
/** Пароль по контракту Go: 8–72 печатных ASCII-символа без пробелов, без trim и нормализации. */
export const PASSWORD = { min: 8, max: 72, pattern: /^[!-~]+$/ } as const;
const login = string(LOGIN);
const password = string(PASSWORD);

/** Логин отдельно — для проверки формы до отправки той же функцией, что и в BFF. */
export const loginValue = validator(login);

/** Пароль отдельно — для проверки формы до отправки той же функцией, что и в BFF. */
export const passwordValue = validator(password);
/** ID блокнота: положительное целое. */
const notebookId = int({ min: 1 });
/** Название блокнота: 1–128 символов. */
const notebookName = string({ min: 1, max: 128 });
/** ID ячейки: 1–64 символа a–z, A–Z, 0–9, `_` и `-`. */
const cellId = string({ min: 1, max: 64, pattern: /^[a-zA-Z0-9_-]+$/ });
/** SHA-256 source ячейки: 64 строчные hex-цифры. */
const sourceHash = string({ min: 64, max: 64, pattern: /^[0-9a-f]{64}$/ });
/** Таймаут команды: 1–86400 секунд, по умолчанию 300. */
const timeoutSeconds = withDefault(number({ min: 1, max: 86400 }), 300);
/** ID runtime-сессии: UUID. */
const sessionId = uuid;
/** ID исполнения: 1–128 символов. */
const executionId = string({ min: 1, max: 128 });
/** Блокнот и его `hash` — без HTTP-кавычек, их ставит BFF в `If-Match`. */
const target = { notebookId, hash: string({ min: 1, pattern: /^[^"\r\n]+$/ }) };

/** Регистрация: логин и пароль. */
export const registerInput = validator(object({ login, password }));

/** Вход: логин, пароль и при включённой 2FA — код; его формат проверяет Go. */
export const loginInput = validator(object({ login, password, user_code: optional(string()) }));

/** Новый логин в профиле. */
export const updateLoginInput = validator(object({ login }));

/** Смена пароля: текущий и новый. */
export const changePasswordInput = validator(
    object({ current_password: password, new_password: password }),
);

/** Подтверждение 2FA: ровно шесть цифр. */
export const confirmTwoFactorInput = validator(
    object({ user_code: string({ min: 6, max: 6, pattern: /^[0-9]{6}$/ }) }),
);

/** Отключение 2FA по паролю. */
export const disableTwoFactorInput = validator(object({ password }));

/** Query страницы списка блокнотов. */
export const listNotebooksInput = validator(
    query({
        limit: optional(intParam({ min: 1, max: 100 })),
        cursor: optional(string({ min: 1 })),
    }),
);

/** Query блокнота по ID. */
export const getNotebookInput = validator(query({ id: intParam({ min: 1 }) }));

/** Создание блокнота. */
export const createNotebookInput = validator(object({ name: notebookName }));

/** Переименование блокнота. */
export const renameNotebookInput = validator(
    object({ id: notebookId, name: notebookName }, 'strict'),
);

/** Удаление блокнота. */
export const deleteNotebookInput = validator(object({ id: notebookId }));

/** Новая ячейка: без `index` — в конец. */
export const createCellInput = validator(
    object(
        {
            ...target,
            kind: oneOf(['code', 'markdown']),
            source: string(),
            index: optional(int({ min: 0, max: 1000 })),
        },
        'strict',
    ),
);

/** Новое содержимое ячейки. */
export const updateCellInput = validator(object({ ...target, cellId, source: string() }, 'strict'));

/** Перенос ячейки на итоговую позицию. */
export const moveCellInput = validator(
    object({ ...target, cellId, index: int({ min: 0, max: 999 }) }, 'strict'),
);

/** Удаление ячейки. */
export const deleteCellInput = validator(object({ ...target, cellId }, 'strict'));

/** Запуск окружения блокнота. */
export const startRuntimeInput = validator(
    object({ notebookId, requestId: string({ min: 1, max: 128 }) }, 'strict'),
);

/** Исполнение одной ячейки. */
export const executeInput = validator(
    object(
        {
            sessionId,
            execution_id: executionId,
            cell_id: string({ min: 1 }),
            source_hash: sourceHash,
            timeout_seconds: timeoutSeconds,
        },
        'strict',
    ),
);

/** Пакетный запуск всех code-ячеек. */
export const executeAllInput = validator(
    object(
        {
            sessionId,
            request_id: string({ min: 1, max: 128 }),
            cells: array(object({ cell_id: cellId, source_hash: sourceHash }), {
                min: 1,
                max: 1000,
            }),
            timeout_seconds: timeoutSeconds,
        },
        'strict',
    ),
);

/** Команда окружению по ID сессии. */
export const runtimeSessionInput = validator(object({ sessionId }, 'strict'));

/** Сколько исполнений клиент может отслеживать в одном запросе `runtime/updates`. */
export const MAX_TRACKED = 100;

/** Шаг наблюдения за окружением: курсор событий и отслеживаемые исполнения. */
export const runtimeUpdatesInput = validator(
    object(
        {
            sessionId,
            after: withDefault(int({ min: 0 }), 0),
            executionIds: withDefault(array(executionId, { max: MAX_TRACKED }), []),
        },
        'strict',
    ),
);

/** Предел файла аватара по контракту Go: 5 МиБ; один для браузера и BFF. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Файл с размером в пределах, байт.
 * @param bounds пределы размера
 */
const file =
    (bounds: Bounds): Check<File> =>
    (value, path, issues) => {
        if (!(value instanceof File)) return fail(issues, path, 'Ожидался файл');
        const message = outOfBounds(value.size, bounds);
        return message ? fail(issues, path, `Размер файла: ${message.toLowerCase()}`) : value;
    };

/**
 * Multipart аватара: единственное поле `avatar` с непустым файлом до 5 МиБ. В Go уходит только
 * файл, поэтому весь запрос укладывается в предел Go 6 МиБ.
 */
export const avatarInput = validator(
    object({ avatar: file({ min: 1, max: AVATAR_MAX_BYTES }) }, 'strict'),
);

/**
 * Runtime-сессия блокнота, как её отдаёт BFF (`activeRuntimeSession` в ошибке
 * `409 active_session_exists`): все поля `RuntimeSession` по контракту Go, лишние отбрасываются.
 * Тип `Validator<RuntimeSession>` заставляет компилятор сверить проверку с DTO.
 */
export const runtimeSessionValue: Validator<RuntimeSession> = validator(
    object({
        id: sessionId,
        notebook_id: notebookId,
        language: oneOf(['python']),
        state: oneOf([
            'PROVISIONING',
            'STARTING',
            'READY',
            'RECONNECTING',
            'STOPPING',
            'STOPPED',
            'FAILED',
        ]),
        stage: oneOf([
            'queued',
            'creating_vps',
            'configuring_agent',
            'verifying_agent',
            'ready',
            'reconnecting',
            'stopping',
            'deleting_environment',
            'cleanup_pending',
            'stopped',
            'failed',
        ]),
        reason: nullable(string()),
        generation: nullable(string({ pattern: UUID })),
        created_at: string(),
        last_activity_at: string(),
        public_seq: int({ min: 0 }),
        journal_incomplete: boolean,
        cleanup_error: nullable(string()),
    }),
);

/** Scope ключа OnlineConf: frontend или имя микросервиса. */
const onlineConfScope = string({ pattern: /^[a-z][a-z0-9-]{0,31}$/ });
/** Имя ключа OnlineConf, уникальное в scope. */
const onlineConfName = string({ pattern: /^[a-z][a-z0-9_.-]{0,127}$/ });
/** Ключ OnlineConf однозначно задают scope и имя. */
const onlineConfId = { scope: onlineConfScope, name: onlineConfName };
/** ID пользователей флага: до 1000 положительных целых. */
const userIds = array(int({ min: 1 }), { max: 1000 });

/**
 * Любое JSON-значение, включая `false`, `0` и `null`; отсутствие поля — ошибка.
 * @param value проверяемое значение
 * @param path путь до поля
 * @param issues накопитель проблем
 */
const json: Check<{} | null> = (value, path, issues) =>
    value === undefined ? fail(issues, path, 'Обязательное поле') : (value as {} | null);

/**
 * Флаг: ID в каждом списке не повторяются, списки не пересекаются.
 * @param check проверка полей флага
 */
const distinctUsers =
    <T extends { include_user_ids: number[]; exclude_user_ids: number[] }, W>(
        check: Check<T, W>,
    ): Check<T, W> =>
    (value, path, issues) => {
        const flag = check(value, path, issues);
        if (flag === INVALID) return flag;
        for (const field of ['include_user_ids', 'exclude_user_ids'] as const) {
            if (new Set(flag[field]).size !== flag[field].length) {
                return fail(issues, [...path, field], 'ID повторяются');
            }
        }
        const include = new Set(flag.include_user_ids);
        if (flag.exclude_user_ids.some((id) => include.has(id))) {
            return fail(issues, [...path, 'exclude_user_ids'], 'Пересекается с include_user_ids');
        }
        return flag;
    };

/**
 * Вариант по `kind`: проблемы — в полях своего вида, а не «не подходит ни один вариант».
 * @param config проверка конфига
 * @param flag проверка флага
 */
const byKind =
    <C, F, WC, WF>(config: Check<C, WC>, flag: Check<F, WF>): Check<C | F, WC | WF> =>
    (value, path, issues) => {
        const kind = isRecord(value) ? value.kind : undefined;
        if (kind === 'config') return config(value, path, issues);
        if (kind === 'flag') return flag(value, path, issues);
        return fail(issues, [...path, 'kind'], 'Одно из: config, flag');
    };

/**
 * Ключ OnlineConf: scope, имя и значение своего вида.
 * @param mode лишние поля: `strict` — вход, `strip` — ответ Go
 */
export const onlineConfKey = (mode: 'strip' | 'strict') =>
    byKind(
        object({ ...onlineConfId, kind: literal('config'), value: json }, mode),
        distinctUsers(
            object(
                {
                    ...onlineConfId,
                    kind: literal('flag'),
                    rollout_percent: int({ min: 0, max: 100 }),
                    include_user_ids: userIds,
                    exclude_user_ids: userIds,
                },
                mode,
            ),
        ),
    );

/** Ключ OnlineConf в списке. */
export const onlineConfKeySummary = object({ ...onlineConfId, kind: oneOf(['config', 'flag']) });

/** Query списка ключей OnlineConf: scope и необязательная подстрока имени. */
export const listOnlineConfKeysInput = validator(
    query({ scope: onlineConfScope, search: optional(string({ max: 128 })) }),
);

/** Query ключа OnlineConf по scope и имени. */
export const getOnlineConfKeyInput = validator(query(onlineConfId));

/** Ключ OnlineConf для создания и замены: при любой проблеме ничего не сохраняется. */
export const onlineConfKeyInput = validator(onlineConfKey('strict'));
