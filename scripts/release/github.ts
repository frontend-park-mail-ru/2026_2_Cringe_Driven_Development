import { ReleaseError, need } from './env.ts';

/** Окружения GitHub Deployments: готовые выпуски и история прода. */
export const ARTIFACTS_ENV = 'release-artifacts';
/** Окружение истории выкаток и откатов на прод. */
export const PRODUCTION_ENV = 'production';

/** Состояние статуса Deployment в GitHub. */
export type DeploymentState =
    | 'error'
    | 'failure'
    | 'inactive'
    | 'in_progress'
    | 'queued'
    | 'pending'
    | 'success';

/** Payload записи `release-artifacts`: что опубликовано для SHA. */
export interface ArtifactsPayload {
    image_ref: string;
    assets: string;
    ci_run: string;
    notification?: NotificationMetadata;
}

/** Данные нового notification-потребителя; прежние записи остаются историей. */
export interface NotificationMetadata {
    base_sha: string | null;
    report_url: string | null;
    run_attempt: number;
}

/** Payload записи `production`: что выкатывалось и каким запуском. */
export interface ProductionPayload {
    image_ref: string;
    assets: string;
    action: 'deploy' | 'rollback';
    run: string;
    notification?: NotificationMetadata;
}

/** Deployment GitHub с последним статусом. */
export interface Deployment<P> {
    id: number;
    sha: string;
    payload: P;
    createdAt: string;
    /** Последний статус; undefined — статуса ещё нет */
    state: DeploymentState | undefined;
}

const PAGE_SIZE = 100;

interface RawDeployment {
    id: number;
    sha: string;
    payload: unknown;
    created_at: string;
}

/** Запрос REST API текущего репозитория с проверкой HTTP-ошибок. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = process.env.GITHUB_API_URL || 'https://api.github.com';
    const res = await fetch(`${base}/repos/${need('GITHUB_REPOSITORY')}${path}`, {
        ...init,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${need('GITHUB_TOKEN')}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
        throw new ReleaseError(
            `GitHub ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`,
        );
    }
    return (await res.json()) as T;
}

/** GraphQL с явным токеном: Project PAT не смешивается с репозиторным. */
export async function graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    token: string,
): Promise<T> {
    const res = await fetch(process.env.GITHUB_GRAPHQL_URL || 'https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ReleaseError(`GitHub GraphQL: HTTP ${res.status}`);
    const result = (await res.json()) as { data?: T; errors?: unknown[] };
    if (result.errors?.length || !result.data)
        throw new ReleaseError('GitHub GraphQL: ответ содержит ошибки или не содержит data');
    return result.data;
}

/** Статус Deployment с временем и пояснением. */
export interface DeploymentStatus {
    state: DeploymentState;
    createdAt: string;
    description: string;
}

/** Все страницы статусов: первое подтверждение могло находиться давно в истории. */
export async function listDeploymentStatuses(id: number): Promise<DeploymentStatus[]> {
    const result: DeploymentStatus[] = [];
    for (let page = 1; ; page++) {
        const batch = await api<
            { state: DeploymentState; created_at: string; description: string }[]
        >(`/deployments/${id}/statuses?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new ReleaseError(`Некорректные статусы Deployment ${id}`);
        for (const item of batch) {
            if (!Number.isFinite(Date.parse(item.created_at)))
                throw new ReleaseError(`Нет времени статуса Deployment ${id}`);
            result.push({
                state: item.state,
                createdAt: item.created_at,
                description: item.description ?? '',
            });
        }
        if (batch.length < 100) return result;
    }
}

function parsePayload(payload: unknown): unknown {
    // GitHub отдаёт payload объектом, но записи, созданные строкой, приходят строкой
    if (typeof payload !== 'string') return payload;
    try {
        return JSON.parse(payload);
    } catch {
        return undefined;
    }
}

/**
 * Deployments окружения от новых к старым, без запросов статусов.
 * @param environment окружение
 * @param [sha] только записи этого коммита
 * @returns записи
 */
export async function listDeploymentRecords<P>(
    environment: string,
    sha?: string,
): Promise<Omit<Deployment<P>, 'state'>[]> {
    const query = new URLSearchParams({ environment, per_page: String(PAGE_SIZE) });
    if (sha) query.set('sha', sha);
    // вся история: цель отката и защита ассетов могут лежать дальше первой страницы
    const raw: RawDeployment[] = [];
    for (let page = 1; ; page++) {
        query.set('page', String(page));
        const batch = await api<RawDeployment[]>(`/deployments?${query}`);
        raw.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    return raw
        .map((item) => ({
            id: item.id,
            sha: item.sha,
            payload: parsePayload(item.payload) as P,
            createdAt: item.created_at,
        }))
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

/** Deployments с последним статусом каждого, без фильтрации истории. */
export async function listDeployments<P>(
    environment: string,
    sha?: string,
): Promise<Deployment<P>[]> {
    const result: Deployment<P>[] = [];
    for (const item of await listDeploymentRecords<P>(environment, sha)) {
        const statuses = await api<{ state: DeploymentState }[]>(
            `/deployments/${item.id}/statuses?per_page=1`,
        );
        result.push({ ...item, state: statuses[0]?.state });
    }
    return result;
}

/**
 * Создаёт запись Deployment без автоматического слияния и проверки статусов коммита.
 * @param options окружение, полный SHA, задача и payload
 * @param options.environment окружение
 * @param options.sha полный SHA выпуска
 * @param options.task `publish`, `deploy` или `rollback`
 * @param options.payload данные выпуска
 * @returns id записи
 */
export async function createDeployment(options: {
    environment: string;
    sha: string;
    task: string;
    payload: object;
}): Promise<number> {
    const production = options.environment === PRODUCTION_ENV;
    const created = await api<{ id: number }>('/deployments', {
        method: 'POST',
        body: JSON.stringify({
            ref: options.sha,
            task: options.task,
            environment: options.environment,
            payload: options.payload,
            auto_merge: false,
            required_contexts: [],
            production_environment: production,
            transient_environment: false,
            description: `${options.task} ${options.sha}`,
        }),
    });
    return created.id;
}

/**
 * Ставит статус записи Deployment.
 * @param id id записи
 * @param state новое состояние
 * @param description пояснение
 */
export async function setDeploymentState(
    id: number,
    state: DeploymentState,
    description: string,
): Promise<void> {
    await api(`/deployments/${id}/statuses`, {
        method: 'POST',
        body: JSON.stringify({
            state,
            description: description.slice(0, 140),
            log_url: runUrl(),
            // успех прежних выпусков не становится inactive: история нужна для выбора цели отката
            auto_inactive: false,
        }),
    });
}

/**
 * Ссылка на текущий запуск workflow.
 * @returns адрес запуска или пустая строка вне GitHub Actions
 */
export function runUrl(): string {
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
    if (!GITHUB_REPOSITORY || !GITHUB_RUN_ID) return '';
    return `${GITHUB_SERVER_URL || 'https://github.com'}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}
