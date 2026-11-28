// Ручные проверки ответов Go по закреплённому контракту spec/identity, spec/workspace и spec/onlineconf. Только для BFF: в браузер
// не импортируются. Тип Validator<DTO> сверяет проверку с редактируемыми типами @cdd/schemas/types.
import {
    array,
    boolean,
    datetime,
    exactlyOne,
    int,
    literal,
    nullable,
    number,
    object,
    oneOf,
    onlineConfCard,
    onlineConfList,
    onlineConfUser,
    record,
    string,
    url,
    uuid,
    validator,
    type Validator,
} from '@cdd/schemas/validate';

import type {
    AuthResponse,
    Notebook,
    NotebookCellChange,
    NotebookContent,
    NotebookContentChange,
    NotebookListPage,
    OnlineConfCard,
    OnlineConfList,
    OnlineConfMe,
    OnlineConfUser,
    RuntimeBatchExecution,
    RuntimeEventsResponse,
    RuntimeExecution,
    RuntimeQueueSnapshot,
    RuntimeSession,
    TokenPair,
    TwoFactorSetupResponse,
    User,
} from '@cdd/schemas/types';

const user = object({
    id: int({ min: 1 }),
    login: string(),
    avatar_url: nullable(url),
    has_2fa: boolean,
});

const tokens = object({
    access_token: string({ min: 1 }),
    access_expires_in: int({ min: 1 }),
    refresh_token: string({ min: 1 }),
    refresh_expires_in: int({ min: 1 }),
});

const cellId = string({ min: 1, max: 64, pattern: /^[a-zA-Z0-9_-]+$/ });
const hash = string({ min: 1 });
const cell = object({ id: cellId, kind: oneOf(['code', 'markdown', 'raw']), source: string() });
/** Выводы nbformat — открытые объекты, не обрезаются. */
const outputs = array(record);

const runtimeSession = object({
    id: uuid,
    notebook_id: int({ min: 1 }),
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
    generation: nullable(uuid),
    created_at: datetime,
    last_activity_at: datetime,
    public_seq: int({ min: 0 }),
    journal_incomplete: boolean,
    cleanup_error: nullable(string()),
});

const executionId = string({ min: 1, max: 128 });

/** Пользователь: текущий, после смены логина и загрузки аватара. */
export const userResponse: Validator<User> = validator(user);

/** Пользователь и токены после входа или регистрации. */
export const authResponse: Validator<AuthResponse> = validator(object({ user, tokens }));

/** Новая пара токенов после refresh. */
export const tokenPairResponse: Validator<TokenPair> = validator(tokens);

/** Настройка 2FA: QR-код PNG в data URL и секрет base32. */
export const twoFactorSetupResponse: Validator<TwoFactorSetupResponse> = validator(
    object({
        qr_code: string({ pattern: /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/ }),
        secret: string({ pattern: /^[A-Z2-7]+$/ }),
    }),
);

/** Страница списка блокнотов. */
export const notebookListResponse: Validator<NotebookListPage> = validator(
    object({
        items: array(
            object({
                id: int({ min: 1 }),
                name: string(),
                updated_at: datetime,
                cells_count: int(),
                preview_code: string(),
                has_active_session: boolean,
            }),
        ),
        next_cursor: nullable(string()),
        matched_count: int({ min: 0 }),
        total_count: int({ min: 0 }),
    }),
);

/** Блокнот: получение, создание и переименование. */
export const notebookResponse: Validator<Notebook> = validator(
    object({
        id: int({ min: 1 }),
        name: string(),
        cells: array(cell),
        created_at: datetime,
        updated_at: datetime,
    }),
);

/** Содержимое блокнота: редакция и ячейки, у code-ячеек — сохранённые результаты. */
export const notebookContentResponse: Validator<NotebookContent> = validator(
    object({
        hash,
        cells: array(
            exactlyOne(
                object({ id: cellId, kind: oneOf(['markdown', 'raw']), source: string() }),
                object({
                    id: cellId,
                    kind: oneOf(['code']),
                    source: string(),
                    outputs,
                    execution_count: nullable(int({ min: 0 })),
                    output_truncated: boolean,
                }),
            ),
            { max: 1000 },
        ),
    }),
);

/** Добавленная или изменённая ячейка и новая редакция. */
export const cellChangeResponse: Validator<NotebookCellChange> = validator(object({ hash, cell }));

/** Новая редакция после переноса или удаления ячейки. */
export const contentChangeResponse: Validator<NotebookContentChange> = validator(object({ hash }));

/** Runtime-сессия, в том числе занятая из `409 active_session_exists`. */
export const runtimeSessionResponse: Validator<RuntimeSession> = validator(runtimeSession);

/** Активная сессия пользователя или `null`. */
export const activeRuntimeSessionResponse: Validator<{ active_session: RuntimeSession | null }> =
    validator(object({ active_session: nullable(runtimeSession) }));

/** Снимок незавершённых исполнений. */
export const runtimeQueueResponse: Validator<RuntimeQueueSnapshot> = validator(
    object({
        session_id: uuid,
        items: array(
            object({
                execution_id: string(),
                cell_id: string(),
                state: oneOf(['QUEUED', 'RUNNING']),
            }),
        ),
    }),
);

/** Страница событий; `body` события — открытый payload. */
export const runtimeEventsResponse: Validator<RuntimeEventsResponse> = validator(
    object({
        events: array(object({ seq: int({ min: 1 }), kind: string({ min: 1 }), body: record }), {
            max: 100,
        }),
        next_cursor: int({ min: 0 }),
        has_more: boolean,
    }),
);

/** Исполнение ячейки: состояние, выводы и проекция в блокнот. */
export const runtimeExecutionResponse: Validator<RuntimeExecution> = validator(
    object({
        execution_id: executionId,
        session_id: uuid,
        cell_id: string({ min: 1 }),
        source_hash: string({ pattern: /^[0-9a-f]{64}$/ }),
        timeout_seconds: number({ min: 1, max: 86400 }),
        attempt: int({ min: 1 }),
        state: oneOf([
            'QUEUED',
            'RUNNING',
            'SUCCEEDED',
            'FAILED',
            'INTERRUPTED',
            'TIMED_OUT',
            'CANCELLED',
            'UNKNOWN',
            'REJECTED',
        ]),
        outputs,
        execution_count: nullable(int({ min: 0 })),
        output_truncated: boolean,
        projection: oneOf(['pending', 'applied', 'conflict']),
    }),
);

/** Принятый пакет исполнений. */
export const runtimeBatchResponse: Validator<RuntimeBatchExecution> = validator(
    object({
        request_id: string({ min: 1, max: 128 }),
        session_id: uuid,
        execution_ids: array(executionId, { min: 1, max: 1000 }),
    }),
);

/** Остановка или активность сессии принята. */
export const acceptedResponse: Validator<{ accepted: true }> = validator(
    object({ accepted: literal(true) }),
);

/** Исполнения остановлены. */
export const stoppedResponse: Validator<{ stopped: true }> = validator(
    object({ stopped: literal(true) }),
);

/** Прерывание kernel запрошено. */
export const interruptResponse: Validator<{ interrupt_requested: true }> = validator(
    object({ interrupt_requested: literal(true) }),
);

/** Список ключей OnlineConf. */
export const onlineConfListResponse: Validator<OnlineConfList> = validator(onlineConfList);

/** Карточка ключа OnlineConf. */
export const onlineConfCardResponse: Validator<OnlineConfCard> = validator(onlineConfCard);

const maxCells = { notebook_max_cells: int({ min: 1, max: 1000 }) };

/** Публичные значения OnlineConf для главной: только лимит ячеек, лишние поля отбрасываются. */
export const onlineConfHomeResponse: Validator<OnlineConfMe> = validator(object(maxCells));

/** Публичные значения OnlineConf для блокнота: без `notebook_run_all` ответ не принимается. */
export const onlineConfNotebookResponse: Validator<OnlineConfMe> = validator(
    object({ ...maxCells, notebook_run_all: boolean }),
);

/** Пользователь Identity по ID или логину. */
export const onlineConfUserResponse: Validator<OnlineConfUser> = validator(onlineConfUser);
