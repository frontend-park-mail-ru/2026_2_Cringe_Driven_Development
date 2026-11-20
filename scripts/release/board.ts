import { need, ReleaseError, checkSha } from './env.ts';
import { api, graphql, listDeployments, PRODUCTION_ENV } from './github.ts';
import type { ChangeReport, ReleaseKind } from './report.ts';
import { mergedIssuePullRequests, type LinkedIssue } from './catalog.ts';
import { readBoardProduction } from './deployments.ts';
import { readyRelease } from './releases.ts';

/** Итог синхронизации без потери ошибок отдельных карточек. */
export interface BoardResult {
    changed: number;
    skipped: number;
    errors: string[];
}
interface Project {
    id: string;
    field: string;
    option: string;
}
interface Page {
    hasNextPage: boolean;
    endCursor: string | null;
}
interface Event {
    kind: string;
    createdAt: string;
}
interface Issue {
    number: number;
    closed: boolean;
    title: string;
    stateReason: string | null;
    repository: { nameWithOwner: string };
    timelineItems: {
        nodes: Event[];
        pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    };
}
interface Card {
    id: string;
    project: { id: string };
    fieldValueByName: { name: string; updatedAt: string } | null;
}

async function project(target: string): Promise<Project> {
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
        const data: {
            organization: {
                projectV2: {
                    id: string;
                    viewerCanUpdate: boolean;
                    fields: {
                        nodes: {
                            id: string;
                            name: string;
                            options?: { id: string; name: string }[];
                        }[];
                        pageInfo: Page;
                    };
                };
            };
        } = await graphql(
            `
                query ReleaseProject($cursor: String) {
                    organization(login: "Cringe-Driven-Development-Team") {
                        projectV2(number: 1) {
                            id
                            viewerCanUpdate
                            fields(first: 100, after: $cursor) {
                                nodes {
                                    ... on ProjectV2SingleSelectField {
                                        id
                                        name
                                        options {
                                            id
                                            name
                                        }
                                    }
                                }
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                            }
                        }
                    }
                }
            `,
            { cursor },
            need('ADD_TO_PROJECT_PAT'),
        );
        const value = data.organization?.projectV2;
        if (!value?.viewerCanUpdate)
            throw new ReleaseError('Нет права записи Project у ADD_TO_PROJECT_PAT');
        if (
            !value.id ||
            !Array.isArray(value.fields?.nodes) ||
            typeof value.fields.pageInfo?.hasNextPage !== 'boolean'
        )
            throw new ReleaseError('Неполные Project fields');
        const field = value.fields.nodes.find((item) => item.name === 'Status');
        if (field) {
            const option = field.options?.find((candidate) => candidate.name === target)?.id;
            if (!field.id || !option)
                throw new ReleaseError(`Project Status: нет ${target} или ID поля`);
            return { id: value.id, field: field.id, option };
        }
        cursor = value.fields.pageInfo.hasNextPage ? value.fields.pageInfo.endCursor : null;
        if (value.fields.pageInfo.hasNextPage && (!cursor || seen.has(cursor)))
            throw new ReleaseError('Project fields: нет нового курсора');
        if (cursor) seen.add(cursor);
    } while (cursor);
    throw new ReleaseError('Project: нет поля Status');
}

async function issueState(id: string, projectId: string) {
    let cursor: string | null = null;
    let issue: Issue;
    const events: Event[] = [];
    const seen = new Set<string>();
    do {
        const data: { node: Issue } = await graphql(
            `
                query BoardIssue($id: ID!, $cursor: String) {
                    node(id: $id) {
                        ... on Issue {
                            number
                            closed
                            title
                            stateReason
                            repository {
                                nameWithOwner
                            }
                            timelineItems(
                                last: 100
                                before: $cursor
                                itemTypes: [CLOSED_EVENT, REOPENED_EVENT]
                            ) {
                                nodes {
                                    kind: __typename
                                    ... on ClosedEvent {
                                        createdAt
                                    }
                                    ... on ReopenedEvent {
                                        createdAt
                                    }
                                }
                                pageInfo {
                                    hasPreviousPage
                                    startCursor
                                }
                            }
                        }
                    }
                }
            `,
            { id, cursor },
            need('GITHUB_TOKEN'),
        );
        issue = data.node;
        if (
            typeof issue?.closed !== 'boolean' ||
            (issue.stateReason !== null &&
                !['COMPLETED', 'NOT_PLANNED', 'REOPENED', 'DUPLICATE'].includes(
                    issue.stateReason,
                )) ||
            typeof issue.title !== 'string' ||
            !issue.repository?.nameWithOwner ||
            !Array.isArray(issue.timelineItems?.nodes) ||
            typeof issue.timelineItems.pageInfo?.hasPreviousPage !== 'boolean'
        )
            throw new ReleaseError(`Нет полной Issue ${id}`);
        if (
            issue.timelineItems.nodes.some(
                (event) =>
                    !['ClosedEvent', 'ReopenedEvent'].includes(event?.kind) ||
                    !Number.isFinite(Date.parse(event.createdAt)),
            )
        )
            throw new ReleaseError('Некорректная история issue');
        events.push(...issue.timelineItems.nodes);
        cursor = issue.timelineItems.pageInfo.hasPreviousPage
            ? issue.timelineItems.pageInfo.startCursor
            : null;
        if (issue.timelineItems.pageInfo.hasPreviousPage && (!cursor || seen.has(cursor)))
            throw new ReleaseError('Issue timeline: нет нового курсора');
        if (cursor) seen.add(cursor);
    } while (cursor);
    let card: Card | undefined;
    seen.clear();
    cursor = null;
    do {
        const data: { node: { projectItems: { nodes: Card[]; pageInfo: Page } } } = await graphql(
            `
                query BoardCard($id: ID!, $cursor: String) {
                    node(id: $id) {
                        ... on Issue {
                            projectItems(first: 100, after: $cursor) {
                                nodes {
                                    id
                                    project {
                                        id
                                    }
                                    fieldValueByName(name: "Status") {
                                        ... on ProjectV2ItemFieldSingleSelectValue {
                                            name
                                            updatedAt
                                        }
                                    }
                                }
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                            }
                        }
                    }
                }
            `,
            { id, cursor },
            need('ADD_TO_PROJECT_PAT'),
        );
        const connection = data.node?.projectItems;
        if (
            !Array.isArray(connection?.nodes) ||
            typeof connection.pageInfo?.hasNextPage !== 'boolean'
        )
            throw new ReleaseError('Неполные Project items');
        for (const item of connection.nodes) {
            const value = item?.fieldValueByName;
            if (
                !item?.id ||
                !item.project?.id ||
                (value !== null && (!value?.name || !Number.isFinite(Date.parse(value.updatedAt))))
            )
                throw new ReleaseError('Неполная карточка Project');
        }
        card = connection.nodes.find((item) => item.project.id === projectId);
        if (card) break;
        cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
        if (connection.pageInfo.hasNextPage && (!cursor || seen.has(cursor)))
            throw new ReleaseError('Project items: нет нового курсора');
        if (cursor) seen.add(cursor);
    } while (cursor);
    const reopenedAt = events
        .filter((event) => event.kind === 'ReopenedEvent')
        .reduce((latest, event) => Math.max(latest, Date.parse(event.createdAt)), 0);
    return {
        number: issue.number,
        closed: issue.closed,
        title: issue.title,
        reason: issue.stateReason,
        repo: issue.repository.nameWithOwner,
        reopenedAt,
        card,
    };
}

async function contains(base: string, head: string): Promise<boolean> {
    const result = await api<{
        status: string;
        base_commit: { sha: string };
        merge_base_commit: { sha: string };
    }>(`/compare/${checkSha(base)}...${checkSha(head)}?per_page=1`);
    if (
        !['ahead', 'behind', 'identical', 'diverged'].includes(result.status) ||
        result.base_commit?.sha !== base ||
        !result.merge_base_commit?.sha
    )
        throw new ReleaseError('Неполный Git compare');
    return (
        (result.status === 'ahead' || result.status === 'identical') &&
        result.merge_base_commit.sha === base
    );
}

/** Применяет результат проверенной операции к штатно связанным задачам её полного отчёта. */
export async function updateReleaseBoard(
    kind: ReleaseKind,
    report: ChangeReport,
    deploymentId?: number,
): Promise<BoardResult> {
    const repo = 'Cringe-Driven-Development-Team/frontend';
    if (need('GITHUB_REPOSITORY') !== repo || !['publish', 'deploy', 'rollback'].includes(kind))
        throw new ReleaseError('Чужой репозиторий или тип операции');
    if (
        !report.complete ||
        !report.baseSha ||
        !Array.isArray(report.prs) ||
        !Array.isArray(report.issues)
    )
        throw new ReleaseError('Неполный отчёт операции: карточки не обновлены');
    checkSha(report.baseSha);
    checkSha(report.headSha);
    if (
        report.prs.some(
            (pr) => !Number.isSafeInteger(pr.number) || pr.number <= 0 || !pr.mergeSha,
        ) ||
        report.issues.some(
            (issue) =>
                !issue.id ||
                !Number.isSafeInteger(issue.number) ||
                issue.number <= 0 ||
                !Array.isArray(issue.prNumbers),
        )
    )
        throw new ReleaseError('Некорректный отчёт операции');
    const repository = await api<{ full_name: string; default_branch: string }>('');
    if (repository.full_name !== repo || !repository.default_branch)
        throw new ReleaseError('Нет default branch репозитория');
    const main = async () =>
        checkSha(
            (
                await api<{ commit: { sha: string } }>(
                    `/branches/${encodeURIComponent(repository.default_branch)}`,
                )
            ).commit?.sha,
        );
    if (
        !(await contains(report.baseSha, report.headSha)) ||
        !(await contains(report.headSha, await main()))
    )
        throw new ReleaseError('Диапазон вне истории default branch');
    for (const pr of report.prs) {
        if (
            !(await contains(pr.mergeSha, report.headSha)) ||
            (await contains(pr.mergeSha, report.baseSha))
        )
            throw new ReleaseError(`PR #${pr.number} вне диапазона`);
    }
    const verifyOperation = async () => {
        if (kind === 'publish') {
            if (deploymentId !== undefined)
                throw new ReleaseError('Publish не принимает Deployment ID');
            const { manifest } = await readyRelease(report.headSha);
            if (manifest.notification.base_sha !== report.baseSha)
                throw new ReleaseError('База отчёта не совпадает с Release');
            return undefined;
        }
        const production = await readBoardProduction(deploymentId!);
        const { operation } = production;
        if (
            operation.payload.action !== kind ||
            operation.sha !== (kind === 'rollback' ? report.baseSha : report.headSha) ||
            operation.payload.notification?.base_sha !==
                (kind === 'rollback' ? report.headSha : report.baseSha)
        )
            throw new ReleaseError('Deployment не соответствует отчёту');
        return production;
    };
    await verifyOperation();
    const result: BoardResult = { changed: 0, skipped: 0, errors: [] };
    if (!report.issues.length) return result;
    const target =
        kind === 'publish'
            ? 'Ready for release'
            : kind === 'deploy'
              ? 'Done'
              : 'Rollback from production';
    const context = await project(target);
    const issues = new Map<string, LinkedIssue>();
    for (const linked of report.issues) {
        const previous = issues.get(linked.id);
        issues.set(
            linked.id,
            previous
                ? {
                      ...previous,
                      prNumbers: [...new Set([...previous.prNumbers, ...linked.prNumbers])],
                  }
                : linked,
        );
    }
    let lastState: Awaited<ReturnType<typeof issueState>> | undefined;
    const describeState = (state?: Awaited<ReturnType<typeof issueState>>) =>
        `${state ? (state.closed ? 'closed' : 'open') : 'unknown'}/${state?.card?.fieldValueByName?.name ?? '?'}`;
    const processIssue = async (linked: LinkedIssue) => {
        const basis =
            kind === 'publish' ? `Release ${report.headSha}` : `Deployment ${deploymentId}`;
        const log = (reason: string, state?: Awaited<ReturnType<typeof issueState>>) =>
            console.log(
                `issue #${linked.number}: ${basis}; ${describeState(state)} -> ${target}; ${reason}`,
            );
        const skip = (reason: string, state?: Awaited<ReturnType<typeof issueState>>) => {
            log(`skip: ${reason}`, state);
            result.skipped++;
        };
        if (linked.repo !== repo) return skip('чужой репозиторий');
        const eligible = async (state: Awaited<ReturnType<typeof issueState>>) => {
            if (state.number !== linked.number)
                throw new ReleaseError('Номер issue не совпадает с ID отчёта');
            if (state.repo !== repo || (state.closed && state.reason !== 'COMPLETED'))
                return 'ручное закрытие не completed';
            const prs = await mergedIssuePullRequests(linked.id);
            const head = await main();
            let latest: (typeof prs)[number] | undefined;
            for (const pr of prs) {
                if (!(await contains(pr.mergeSha, head)))
                    throw new ReleaseError(`PR #${pr.number} вне default branch`);
                if (!latest || (await contains(latest.mergeSha, pr.mergeSha))) latest = pr;
                else if (!(await contains(pr.mergeSha, latest.mergeSha)))
                    throw new ReleaseError('Неоднозначный порядок связанных PR');
            }
            if (
                !latest ||
                !linked.prNumbers.includes(latest.number) ||
                !report.prs.some(
                    (pr) => pr.number === latest.number && pr.mergeSha === latest.mergeSha,
                )
            )
                return 'последний связанный merge вне операции';
            if (state.reopenedAt >= Date.parse(latest.mergedAt)) return 'ручной reopen после merge';
            if (!state.card) throw new ReleaseError('Нет карточки Scrumban');
            const value = state.card.fieldValueByName;
            if (value && !Number.isFinite(Date.parse(value.updatedAt)))
                throw new ReleaseError('Нет времени Status');
            if (kind === 'publish') {
                if (state.closed) return 'completed закрыта вручную или CD';
                if (
                    ['Done', 'Rollback from production'].includes(value?.name ?? '') &&
                    Date.parse(value!.updatedAt) >= Date.parse(latest.mergedAt)
                )
                    return 'сохранён более поздний статус цикла';
            }
            const production = await verifyOperation();
            if (production) {
                const present = await contains(latest.mergeSha, production.current.sha);
                if (present !== (kind === 'deploy'))
                    return 'эффект операции отменён текущим production';
                if (kind === 'rollback') {
                    let confirmed = false;
                    for (const record of await listDeployments(PRODUCTION_ENV)) {
                        if (
                            record.id >= production.operation.id ||
                            record.state !== 'success' ||
                            Date.parse(record.createdAt) < Date.parse(latest.mergedAt)
                        )
                            continue;
                        if (!(await contains(latest.mergeSha, record.sha))) continue;
                        const checked = await readBoardProduction(record.id);
                        if (await contains(latest.mergeSha, checked.operation.sha)) {
                            confirmed = true;
                            break;
                        }
                    }
                    if (!confirmed)
                        return 'нет подтверждённого присутствия актуального merge в production';
                }
            }
            return latest;
        };
        for (let attempt = 0; attempt < 3; attempt++) {
            let state = await issueState(linked.id, context.id);
            lastState = state;
            const eligibility = await eligible(state);
            if (typeof eligibility === 'string') return skip(eligibility, state);
            const latest = await issueState(linked.id, context.id);
            lastState = latest;
            if (JSON.stringify(latest) !== JSON.stringify(state)) continue;
            // Перечитываем связи и production непосредственно перед первой записью.
            const rechecked = await eligible(latest);
            if (typeof rechecked === 'string') return skip(rechecked, latest);
            if (kind === 'deploy' && !state.closed) {
                const closed = await api<{ number: number; state: string; state_reason: string }>(
                    `/issues/${linked.number}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
                    },
                );
                if (
                    closed.number !== linked.number ||
                    closed.state !== 'closed' ||
                    closed.state_reason !== 'completed'
                )
                    throw new ReleaseError('Нет подтверждения закрытия completed');
                log('closed completed; проверка Status', state);
                state = await issueState(linked.id, context.id);
                lastState = state;
                if (!state.closed || state.reason !== 'COMPLETED')
                    throw new ReleaseError('Закрытие completed не подтверждено чтением');
                const afterClose = await eligible(state);
                if (typeof afterClose === 'string') return skip(afterClose, state);
            }
            const status = state.card!.fieldValueByName;
            const reset =
                status?.name === target &&
                Date.parse(status.updatedAt) < Date.parse(rechecked.mergedAt);
            if (status?.name === target && !reset) return skip('уже установлен', state);
            const written = await graphql<Record<string, { projectV2Item: { id: string } }>>(
                `
                    mutation UpdateReleaseStatus(
                        $project: ID!
                        $item: ID!
                        $field: ID!
                        $option: String!
                        $reset: Boolean!
                    ) {
                        clearProjectV2ItemFieldValue(
                            input: { projectId: $project, itemId: $item, fieldId: $field }
                        ) @include(if: $reset) {
                            projectV2Item {
                                id
                            }
                        }
                        updateProjectV2ItemFieldValue(
                            input: {
                                projectId: $project
                                itemId: $item
                                fieldId: $field
                                value: { singleSelectOptionId: $option }
                            }
                        ) {
                            projectV2Item {
                                id
                            }
                        }
                    }
                `,
                {
                    project: context.id,
                    item: state.card!.id,
                    field: context.field,
                    option: context.option,
                    reset,
                },
                need('ADD_TO_PROJECT_PAT'),
            );
            if (
                written.updateProjectV2ItemFieldValue?.projectV2Item?.id !== state.card!.id ||
                (reset &&
                    written.clearProjectV2ItemFieldValue?.projectV2Item?.id !== state.card!.id)
            )
                throw new ReleaseError('Нет подтверждения записи Status');
            const confirmed = await issueState(linked.id, context.id);
            lastState = confirmed;
            if (
                confirmed.card?.fieldValueByName?.name !== target ||
                Date.parse(confirmed.card.fieldValueByName.updatedAt) <
                    Date.parse(rechecked.mergedAt) ||
                confirmed.closed !== state.closed ||
                confirmed.reason !== state.reason ||
                confirmed.reopenedAt !== state.reopenedAt
            )
                throw new ReleaseError('Нет подтверждения Status текущего цикла');
            log('changed', state);
            result.changed++;
            return;
        }
        throw new ReleaseError('Issue менялась перед записью; повторите операцию');
    };
    for (const linked of issues.values()) {
        lastState = undefined;
        try {
            await processIssue(linked);
        } catch (error) {
            const message = `issue #${linked.number}: ${kind} ${deploymentId ?? report.headSha}; ${describeState(lastState)} -> ${target}; error: ${error instanceof Error ? error.message : String(error)}`;
            console.warn(message);
            result.errors.push(message);
        }
    }
    return result;
}
