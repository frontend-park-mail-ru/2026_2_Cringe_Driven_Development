/**
 * Типы контракта Go: редактируемый исходник по закреплённой копии spec/identity, spec/workspace и
 * spec/onlineconf, не
 * генерация. Описаны только операции, которые вызывает приложение. Компилятор проверяет вызовы
 * относительно этих типов, но не доказывает их соответствие спеке: риск расхождения принят
 * (frontend#253). Ограничения min/max/pattern/format проверяются в рантайме, не здесь.
 * `X-BFF-Key` добавляет транспорт, `Authorization` и `X-Request-ID` — сессия, поэтому в карте их нет.
 */
/** Пользователь. */
export interface User {
    id: number;
    login: string;
    /** Публичный URL аватара на CDN; null — аватар не загружен. */
    avatar_url: string | null;
    has_2fa: boolean;
}

/** Пароль пользователя. */
export type Password = string;

/** Логин и пароль для регистрации. */
export interface Credentials {
    login: string;
    password: Password;
}

/** Вход: при включённой 2FA — с кодом `user_code`. */
export interface LoginRequest {
    login: string;
    password: Password;
    user_code?: string;
}

/** Пара токенов Go и их сроки в секундах. */
export interface TokenPair {
    access_token: string;
    access_expires_in: number;
    refresh_token: string;
    refresh_expires_in: number;
}

/** Ответ входа и регистрации. */
export interface AuthResponse {
    user: User;
    tokens: TokenPair;
}

/** Тело refresh и logout. */
export interface RefreshTokenRequest {
    refresh_token: string;
}

/** Смена логина. */
export interface UpdateCurrentUserRequest {
    login: string;
}

/** Смена пароля. */
export interface ChangeCurrentUserPasswordRequest {
    current_password: Password;
    new_password: Password;
}

/** Секрет и QR-код подключения 2FA. */
export interface TwoFactorSetupResponse {
    qr_code: string;
    secret: string;
}

/** Подтверждение 2FA кодом TOTP. */
export interface ConfirmTwoFactorRequest {
    user_code: string;
}

/** Отключение 2FA паролем. */
export interface DisableTwoFactorRequest {
    password: Password;
}

/** Ошибка Go общего вида. */
export interface Error {
    code:
        | 'validation_error'
        | 'invalid_credentials'
        | 'login_taken'
        | 'unauthorized'
        | 'not_found'
        | 'not_implemented'
        | 'internal'
        | 'csrf_invalid'
        | 's2s_forbidden'
        | 'two_factor_required'
        | 'invalid_totp'
        | 'invalid_current_password'
        | 'rate_limited';
    message: string;
}

/** Ошибка операций профиля. */
export interface UserProfileError {
    code:
        | 'validation_error'
        | 'invalid_current_password'
        | 'login_taken'
        | 'unauthorized'
        | 's2s_forbidden'
        | 'payload_too_large'
        | 'unsupported_media_type'
        | 'internal';
    message: string;
}

/** Вид ячейки. */
export type CellKind = 'code' | 'markdown' | 'raw';

/** Ячейка блокнота. */
export interface Cell {
    id: string;
    kind: CellKind;
    source: string;
}

/** Блокнот. */
export interface Notebook {
    id: number;
    name: string;
    cells: Cell[];
    created_at: string;
    updated_at: string;
}

/** Блокнот в списке. */
export interface NotebookSummary {
    id: number;
    name: string;
    updated_at: string;
    cells_count: number;
    preview_code: string;
    has_active_session: boolean;
}

/** Страница списка блокнотов. */
export interface NotebookListPage {
    items: NotebookSummary[];
    next_cursor: string | null;
    matched_count: number;
    total_count: number;
}

/** Параметры списка блокнотов. */
export type ListNotebooksParams = {
    search?: string;
    limit?: number;
    cursor?: string;
};

/** Создание блокнота. */
export interface CreateNotebookRequest {
    name: string;
}

/** Хеш содержимого блокнота: значение для `If-Match` без кавычек. */
export type NotebookHash = string;

/** Ячейка содержимого блокнота: у code — вывод исполнения. */
export type NotebookContentCell =
    | { id: string; kind: 'markdown' | 'raw'; source: string }
    | {
          id: string;
          kind: 'code';
          source: string;
          outputs: Record<string, unknown>[];
          execution_count: number | null;
          output_truncated: boolean;
      };

/** Содержимое блокнота с хешем. */
export interface NotebookContent {
    hash: NotebookHash;
    cells: NotebookContentCell[];
}

/** Изменённая ячейка и новый хеш. */
export interface NotebookCellChange {
    hash: NotebookHash;
    cell: Cell;
}

/** Новый хеш после изменения содержимого. */
export interface NotebookContentChange {
    hash: NotebookHash;
}

/** Добавление ячейки. */
export interface AddNotebookCellRequest {
    kind: 'code' | 'markdown';
    source: string;
    index?: number;
}

/** Правка текста ячейки. */
export interface EditNotebookCellRequest {
    source: string;
}

/** Перемещение ячейки. */
export interface MoveNotebookCellRequest {
    index: number;
}

/** Ошибка редактирования блокнота. */
export interface NotebookEditingError {
    code:
        | 'validation_error'
        | 'unauthorized'
        | 's2s_forbidden'
        | 'csrf_invalid'
        | 'not_found'
        | 'notebook_conflict'
        | 'too_many_cells'
        | 'internal';
    message: string;
}

/** Блокнот занят окружением: удаление невозможно. */
export interface NotebookInUseError {
    code: 'notebook_in_use';
    message: string;
}

/** Runtime-сессия. */
export interface RuntimeSession {
    id: string;
    notebook_id: number;
    language: 'python';
    state:
        | 'PROVISIONING'
        | 'STARTING'
        | 'READY'
        | 'RECONNECTING'
        | 'STOPPING'
        | 'STOPPED'
        | 'FAILED';
    stage:
        | 'queued'
        | 'creating_vps'
        | 'configuring_agent'
        | 'verifying_agent'
        | 'ready'
        | 'reconnecting'
        | 'stopping'
        | 'deleting_environment'
        | 'cleanup_pending'
        | 'stopped'
        | 'failed';
    reason: string | null;
    generation: string | null;
    created_at: string;
    last_activity_at: string;
    public_seq: number;
    journal_incomplete: boolean;
    cleanup_error: string | null;
}

/** Запуск runtime-сессии. */
export interface RuntimeStartRequest {
    request_id: string;
    language: 'python';
}

/** Ошибка runtime. */
export interface RuntimeError {
    code:
        | 'validation_error'
        | 'unauthorized'
        | 's2s_forbidden'
        | 'not_found'
        | 'conflict'
        | 'queue_full'
        | 'runtime_unavailable'
        | 'internal';
    message: string;
}

/** У пользователя уже есть активная сессия. */
export interface RuntimeActiveSessionConflict {
    code: 'active_session_exists';
    message: string;
    active_session: RuntimeSession;
}

/** 409 запуска runtime-сессии. */
export type RuntimeConflictResponse = RuntimeActiveSessionConflict | RuntimeError;

/** Состояние исполнения. */
export type RuntimeExecutionState =
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'INTERRUPTED'
    | 'TIMED_OUT'
    | 'CANCELLED'
    | 'UNKNOWN'
    | 'REJECTED';

/** Исполнение ячейки. */
export interface RuntimeExecution {
    execution_id: string;
    session_id: string;
    cell_id: string;
    source_hash: string;
    timeout_seconds: number;
    attempt: number;
    state: RuntimeExecutionState;
    outputs: Record<string, unknown>[];
    execution_count: number | null;
    output_truncated: boolean;
    projection: 'pending' | 'applied' | 'conflict';
}

/** Исполнение одной ячейки. */
export interface RuntimeExecuteRequest {
    execution_id: string;
    cell_id: string;
    source_hash: string;
    timeout_seconds?: number;
}

/** Исполнение нескольких ячеек. */
export interface RuntimeBatchExecuteRequest {
    request_id: string;
    cells: { cell_id: string; source_hash: string }[];
    timeout_seconds?: number;
}

/** Принятое пакетное исполнение. */
export interface RuntimeBatchExecution {
    request_id: string;
    session_id: string;
    execution_ids: string[];
}

/** Очередь исполнения. */
export interface RuntimeQueueSnapshot {
    session_id: string;
    items: { execution_id: string; cell_id: string; state: 'QUEUED' | 'RUNNING' }[];
}

/** Событие журнала runtime: `body` — свободный payload. */
export interface RuntimeEvent {
    seq: number;
    kind: string;
    body: Record<string, unknown>;
}

/** Страница журнала runtime. */
export interface RuntimeEventsResponse {
    events: RuntimeEvent[];
    next_cursor: number;
    has_more: boolean;
}

type Json<T> = { 'application/json': T };
type Errors<S extends number, E> = { [K in S]: E };
type Id = { id: number };
type RuntimeId = { id: string };
type IfMatch = { 'If-Match': string };
type RuntimeErrors = Errors<400 | 401 | 403 | 404 | 500, Error> & { 503: RuntimeError };
type RuntimeConflictErrors = RuntimeErrors & { 409: RuntimeError };

/** Карта операций Identity. */
export type IdentityPaths = {
    '/users/me': {
        GET: { responses: { 200: User } & Errors<401 | 403 | 500, UserProfileError> };
        PATCH: {
            body: Json<UpdateCurrentUserRequest>;
            responses: { 200: User } & Errors<400 | 401 | 403 | 409 | 500, UserProfileError>;
        };
    };
    '/users/me/password': {
        PUT: {
            body: Json<ChangeCurrentUserPasswordRequest>;
            responses: { 204: undefined } & Errors<400 | 401 | 403 | 500, UserProfileError>;
        };
    };
    '/users/me/avatar': {
        PUT: {
            body: { 'multipart/form-data': { avatar: Blob } };
            responses: { 200: User } & Errors<400 | 401 | 403 | 413 | 415 | 500, UserProfileError>;
        };
    };
    '/auth/register': {
        POST: {
            body: Json<Credentials>;
            responses: { 201: AuthResponse } & Errors<400 | 403 | 409 | 500, Error>;
        };
    };
    '/auth/login': {
        POST: {
            body: Json<LoginRequest>;
            responses: { 200: AuthResponse } & Errors<400 | 401 | 403 | 412 | 429 | 500, Error>;
        };
    };
    '/auth/refresh': {
        POST: {
            body: Json<RefreshTokenRequest>;
            responses: { 200: TokenPair } & Errors<400 | 401 | 403 | 500, Error>;
        };
    };
    '/auth/logout': {
        POST: {
            body: Json<RefreshTokenRequest>;
            responses: { 204: undefined } & Errors<400 | 401 | 403 | 500, Error>;
        };
    };
    '/auth/logout-all': {
        POST: { responses: { 204: undefined } & Errors<401 | 403 | 500, Error> };
    };
    '/auth/enable2fa': {
        POST: {
            responses: { 200: TwoFactorSetupResponse } & Errors<400 | 401 | 403 | 429 | 500, Error>;
        };
    };
    '/auth/confirm2fa': {
        POST: {
            body: Json<ConfirmTwoFactorRequest>;
            responses: { 200: undefined } & Errors<400 | 401 | 403 | 429 | 500, Error>;
        };
    };
    '/auth/disable2fa': {
        POST: {
            body: Json<DisableTwoFactorRequest>;
            responses: { 200: undefined } & Errors<400 | 401 | 403 | 429 | 500, Error>;
        };
    };
};

type WorkspaceNotebook = Notebook & {
    access: {
        is_owner: boolean;
        can_edit: boolean;
        can_manage_sharing: boolean;
        can_clone: boolean;
    };
};

/** Карта операций Workspace. */
export type WorkspacePaths = {
    '/notebooks/{id}/clone': {
        POST: {
            params: { path: Id };
            responses: { 201: WorkspaceNotebook } & Errors<400 | 401 | 403 | 404 | 500, Error>;
        };
    };
    '/notebooks': {
        GET: {
            params: { query?: ListNotebooksParams };
            responses: { 200: NotebookListPage } & Errors<400 | 401 | 403 | 500, Error>;
        };
        POST: {
            body: Json<CreateNotebookRequest>;
            responses: { 201: WorkspaceNotebook } & Errors<400 | 401 | 403 | 500, Error>;
        };
    };
    '/notebooks/{id}': {
        GET: {
            params: { path: Id };
            responses: { 200: WorkspaceNotebook } & Errors<400 | 401 | 403 | 404 | 500, Error>;
        };
        PATCH: {
            params: { path: Id };
            body: Json<{ name: string }>;
            responses: { 200: WorkspaceNotebook } & Errors<400 | 401 | 403 | 404 | 500, Error>;
        };
        DELETE: {
            params: { path: Id };
            responses: { 204: undefined; 409: NotebookInUseError } & Errors<
                400 | 401 | 403 | 404 | 500,
                Error
            >;
        };
    };
    '/notebooks/{id}/content': {
        GET: {
            params: { path: Id };
            responses: { 200: NotebookContent } & Errors<
                400 | 401 | 403 | 404 | 500,
                NotebookEditingError
            >;
        };
    };
    '/notebooks/{id}/content/cells': {
        POST: {
            params: { path: Id; header: IfMatch };
            body: Json<AddNotebookCellRequest>;
            responses: { 201: NotebookCellChange } & Errors<
                400 | 401 | 403 | 404 | 409 | 500,
                NotebookEditingError
            >;
        };
    };
    '/notebooks/{id}/content/cells/{cell_id}': {
        PATCH: {
            params: { path: Id & { cell_id: string }; header: IfMatch };
            body: Json<EditNotebookCellRequest>;
            responses: { 200: NotebookCellChange } & Errors<
                400 | 401 | 403 | 404 | 409 | 500,
                NotebookEditingError
            >;
        };
        DELETE: {
            params: { path: Id & { cell_id: string }; header: IfMatch };
            responses: { 200: NotebookContentChange } & Errors<
                400 | 401 | 403 | 404 | 409 | 500,
                NotebookEditingError
            >;
        };
    };
    '/notebooks/{id}/content/cells/{cell_id}/move': {
        POST: {
            params: { path: Id & { cell_id: string }; header: IfMatch };
            body: Json<MoveNotebookCellRequest>;
            responses: { 200: NotebookContentChange } & Errors<
                400 | 401 | 403 | 404 | 409 | 500,
                NotebookEditingError
            >;
        };
    };
    '/notebooks/{id}/runtime-sessions': {
        POST: {
            params: { path: Id };
            body: Json<RuntimeStartRequest>;
            responses: { 202: RuntimeSession; 409: RuntimeConflictResponse } & RuntimeErrors;
        };
    };
    '/runtime-sessions/active': {
        GET: { responses: { 200: { active_session: RuntimeSession | null } } & RuntimeErrors };
    };
    '/runtime-sessions/{id}': {
        GET: { params: { path: RuntimeId }; responses: { 200: RuntimeSession } & RuntimeErrors };
    };
    '/runtime-sessions/{id}/queue': {
        GET: {
            params: { path: RuntimeId };
            responses: { 200: RuntimeQueueSnapshot } & RuntimeErrors;
        };
    };
    '/runtime-sessions/{id}/events': {
        GET: {
            params: { path: RuntimeId; query?: { after?: number } };
            responses: { 200: RuntimeEventsResponse } & RuntimeErrors;
        };
    };
    '/runtime-sessions/{id}/executions': {
        POST: {
            params: { path: RuntimeId };
            body: Json<RuntimeExecuteRequest>;
            responses: { 202: RuntimeExecution; 429: RuntimeError } & RuntimeConflictErrors;
        };
    };
    '/runtime-sessions/{id}/executions/batch': {
        POST: {
            params: { path: RuntimeId };
            body: Json<RuntimeBatchExecuteRequest>;
            responses: { 202: RuntimeBatchExecution; 429: RuntimeError } & RuntimeConflictErrors;
        };
    };
    '/runtime-sessions/{id}/executions/{execution_id}': {
        GET: {
            params: { path: RuntimeId & { execution_id: string } };
            responses: { 200: RuntimeExecution } & RuntimeErrors;
        };
    };
    '/runtime-sessions/{id}/executions/stop': {
        POST: {
            params: { path: RuntimeId };
            responses: { 200: { stopped: true } } & RuntimeConflictErrors;
        };
    };
    '/runtime-sessions/{id}/stop': {
        POST: {
            params: { path: RuntimeId };
            responses: { 202: { accepted: true } } & RuntimeErrors;
        };
    };
    '/runtime-sessions/{id}/activity': {
        POST: {
            params: { path: RuntimeId };
            responses: { 200: { accepted: true } } & RuntimeConflictErrors;
        };
    };
    '/runtime-sessions/{id}/kernel/interrupt': {
        POST: {
            params: { path: RuntimeId };
            responses: { 200: { interrupt_requested: true } } & RuntimeConflictErrors;
        };
    };
};

/** Scope ключа OnlineConf. */
export type OnlineConfScope = 'frontend' | 'bff' | 'identity' | 'workspace';

/** Пользователь в карточке OnlineConf: ID и логин, подтверждённые Identity. */
export interface OnlineConfUser {
    id: number;
    login: string;
}

/** Строка списка: полное имя начинается со scope и точки. */
interface OnlineConfItemBase {
    name: string;
    scope: OnlineConfScope;
    updated_at: string;
}

/** Конфиг в списке: произвольное JSON-значение, `false`, `0` и `null` — тоже значения. */
export interface OnlineConfConfigItem extends OnlineConfItemBase {
    type: 'config';
    value: unknown;
}

/** Флаг в списке. */
export interface OnlineConfFlagItem extends OnlineConfItemBase {
    type: 'flag';
    enabled: boolean;
    rollout_percent: number;
}

/** Метаданные карточки. */
interface OnlineConfCardMeta {
    description: string;
    created_at: string;
    created_by: OnlineConfUser;
    updated_by: OnlineConfUser;
}

/** Карточка ключа OnlineConf. */
export type OnlineConfCard =
    | (OnlineConfConfigItem & OnlineConfCardMeta & { format: 'json' })
    | (OnlineConfFlagItem &
          OnlineConfCardMeta & {
              include_users: OnlineConfUser[];
              exclude_users: OnlineConfUser[];
              rollout_policy: OnlineConfRolloutPolicy;
          });

/**
 * Регламент раскатки флага от сервера: ступени, ближайшая ступень выше сохранённой
 * (null на 100% или у выключенного флага) и время UTC, с которого она доступна (null — сразу).
 */
export interface OnlineConfRolloutPolicy {
    stages: number[];
    next_percent: number | null;
    next_allowed_at: string | null;
}

/** Сохранённое решение по флагу для пользователя и первое применимое правило. */
export interface OnlineConfEvaluation {
    enabled: boolean;
    reason: 'disabled' | 'excluded' | 'included' | 'rollout';
}

/** Список ключей с общими счётчиками до фильтрации. */
export interface OnlineConfList {
    items: (OnlineConfConfigItem | OnlineConfFlagItem)[];
    total_count: number;
    scope_count: number;
    scopes: OnlineConfScope[];
}

/** Создание ключа: конфиг получает `null`, флаг — выключен, 0% и пустые списки. */
export type OnlineConfCreate = { name: string; scope: OnlineConfScope; description?: string } & (
    | { type: 'config'; format: 'json' }
    | { type: 'flag' }
);

/** Полная замена редактируемых полей; тип ключа не меняется. */
export type OnlineConfUpdate =
    | { description: string; value: unknown }
    | {
          description: string;
          enabled: boolean;
          rollout_percent: number;
          include_user_ids: number[];
          exclude_user_ids: number[];
      };

/** Ошибка OnlineConf. */
export interface OnlineConfError {
    code:
        | 'validation_error'
        | 'unauthorized'
        | 'forbidden'
        | 's2s_forbidden'
        | 'not_found'
        | 'key_name_taken'
        | 'rollout_step_not_allowed'
        | 'internal_error'
        | 'onlineconf_unavailable'
        | 'dependency_unavailable';
    message: string;
}

type OnlineConfErrors<S extends number = never> = Errors<
    401 | 403 | 500 | 503 | S,
    OnlineConfError
>;
type KeyPath = { path: { name: string } };

/** Карта операций OnlineConf: пути от корня сервиса, без `/api/v1`. */
export type OnlineConfPaths = {
    '/admin/access': { GET: { responses: { 204: undefined } & OnlineConfErrors } };
    '/admin/keys': {
        GET: {
            params: {
                query: { search?: string; scope?: OnlineConfScope; type?: 'config' | 'flag' };
            };
            responses: { 200: OnlineConfList } & OnlineConfErrors<400>;
        };
        POST: {
            body: Json<OnlineConfCreate>;
            responses: { 201: OnlineConfCard } & OnlineConfErrors<400 | 409>;
        };
    };
    '/admin/keys/{name}': {
        GET: { params: KeyPath; responses: { 200: OnlineConfCard } & OnlineConfErrors<404> };
        PUT: {
            params: KeyPath;
            body: Json<OnlineConfUpdate>;
            responses: { 200: OnlineConfCard } & OnlineConfErrors<400 | 404>;
        };
        DELETE: { params: KeyPath; responses: { 204: undefined } & OnlineConfErrors<404> };
    };
    '/admin/keys/{name}/evaluate': {
        GET: {
            params: { path: { name: string }; query: { user_id: number } };
            responses: { 200: OnlineConfEvaluation } & OnlineConfErrors<400 | 404>;
        };
    };
    '/admin/users/resolve': {
        GET: {
            params: { query: { id: number } | { login: string } };
            responses: { 200: OnlineConfUser } & OnlineConfErrors<400 | 404>;
        };
    };
};
