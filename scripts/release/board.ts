import { need, ReleaseError } from './env.ts';
import { graphql } from './github.ts';
import {
    readProductionDeployments,
    readReleaseSnapshot,
    type ReleaseSnapshot,
    type LinkedIssue,
} from './catalog.ts';

/** Итог синхронизации без потери ошибок отдельных карточек. */
export interface BoardResult {
    changed: number;
    skipped: number;
    errors: string[];
}
interface Project {
    id: string;
    field: string;
    ready: string;
    done: string;
}
interface Page {
    hasNextPage: boolean;
    endCursor: string | null;
}
interface Event {
    kind: string;
    createdAt: string;
    closer?: {
        kind: string;
        number: number;
        merged: boolean;
        baseRefName: string;
        repository: { nameWithOwner: string; defaultBranchRef: { name: string } | null };
    } | null;
}
interface Issue {
    closed: boolean;
    title: string;
    stateReason: string;
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

async function project(): Promise<Project> {
    let cursor: string | null = null;
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
        const field = value.fields.nodes.find((item) => item.name === 'Status');
        if (field) {
            const ready = field.options?.find((option) => option.name === 'Ready for release')?.id;
            const done = field.options?.find((option) => option.name === 'Done')?.id;
            if (!ready || !done)
                throw new ReleaseError('Project Status: нет Ready for release/Done');
            return { id: value.id, field: field.id, ready, done };
        }
        cursor = value.fields.pageInfo.hasNextPage ? value.fields.pageInfo.endCursor : null;
        if (value.fields.pageInfo.hasNextPage && !cursor)
            throw new ReleaseError('Project fields: нет курсора');
    } while (cursor);
    throw new ReleaseError('Project: нет поля Status');
}

async function issueState(id: string, projectId: string) {
    let cursor: string | null = null;
    let issue: Issue;
    const events: Event[] = [];
    do {
        const data: { node: Issue } = await graphql(
            `
                query BoardIssue($id: ID!, $cursor: String) {
                    node(id: $id) {
                        ... on Issue {
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
                                        closer {
                                            kind: __typename
                                            ... on PullRequest {
                                                number
                                                merged
                                                baseRefName
                                                repository {
                                                    nameWithOwner
                                                    defaultBranchRef {
                                                        name
                                                    }
                                                }
                                            }
                                        }
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
        if (!issue?.timelineItems) throw new ReleaseError(`Нет Issue ${id}`);
        events.push(...issue.timelineItems.nodes);
        cursor = issue.timelineItems.pageInfo.hasPreviousPage
            ? issue.timelineItems.pageInfo.startCursor
            : null;
        if (issue.timelineItems.pageInfo.hasPreviousPage && !cursor)
            throw new ReleaseError('Issue timeline: нет курсора');
    } while (cursor);
    let card: Card | undefined;
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
        const connection = data.node.projectItems;
        card = connection.nodes.find((item) => item.project.id === projectId);
        if (card) break;
        cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
        if (connection.pageInfo.hasNextPage && !cursor)
            throw new ReleaseError('Project items: нет курсора');
    } while (cursor);
    const closed = events
        .filter((event) => event.kind === 'ClosedEvent')
        .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const reopened = events.some(
        (event) =>
            event.kind === 'ReopenedEvent' &&
            (!closed || Date.parse(event.createdAt) >= Date.parse(closed.createdAt)),
    );
    return {
        closed: issue.closed,
        title: issue.title,
        reason: issue.stateReason,
        repo: issue.repository.nameWithOwner,
        closedAt: closed?.createdAt,
        closer: closed?.closer,
        reopened,
        card,
    };
}

/** Сверяет закрытые мержем задачи с историей проверенных выпусков. */
export async function syncBoard(snapshot: ReleaseSnapshot, repoDir: string): Promise<BoardResult> {
    const context = await project();
    const result: BoardResult = { changed: 0, skipped: 0, errors: [] };
    let current = snapshot;
    const processIssue = async (linked: LinkedIssue) => {
        if (linked.repo !== 'Cringe-Driven-Development-Team/frontend') {
            result.skipped++;
            return;
        }
        for (;;) {
            const state = await issueState(linked.id, context.id);
            if (
                state.repo !== 'Cringe-Driven-Development-Team/frontend' ||
                !state.closed ||
                state.reopened
            ) {
                result.skipped++;
                return;
            }
            if (
                state.reason !== 'COMPLETED' ||
                state.closer?.kind !== 'PullRequest' ||
                !state.closer.merged ||
                state.closer.repository.nameWithOwner !==
                    'Cringe-Driven-Development-Team/frontend' ||
                state.closer.baseRefName !== state.closer.repository.defaultBranchRef?.name ||
                !linked.prNumbers.includes(state.closer.number)
            ) {
                result.skipped++;
                return;
            }
            if (!state.card) throw new ReleaseError('Нет карточки Scrumban');
            const status = state.card.fieldValueByName?.name;
            if (
                !state.closer ||
                !current.published.some((release) =>
                    release.prNumbers.includes(state.closer!.number),
                )
            ) {
                result.skipped++;
                return;
            }
            const target = current.deployed.has(state.closer.number) ? 'Done' : 'Ready for release';
            const reset =
                status === target &&
                !(
                    Date.parse(state.card.fieldValueByName!.updatedAt) >=
                    Date.parse(state.closedAt!)
                );
            if (status === target && !reset) {
                result.skipped++;
                return;
            }
            const latest = await issueState(linked.id, context.id);
            if (JSON.stringify(latest) !== JSON.stringify(state)) continue;
            // Same-option writes may be no-ops; recreate stale evidence for this closure.
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
                    option: target === 'Done' ? context.done : context.ready,
                    reset,
                },
                need('ADD_TO_PROJECT_PAT'),
            );
            if (
                written.updateProjectV2ItemFieldValue?.projectV2Item?.id !== state.card.id ||
                (reset && written.clearProjectV2ItemFieldValue?.projectV2Item?.id !== state.card.id)
            )
                throw new ReleaseError('Нет подтверждения записи Status');
            if (reset) {
                const confirmed = await issueState(linked.id, context.id);
                const value = confirmed.card?.fieldValueByName;
                if (
                    !confirmed.closed ||
                    confirmed.reopened ||
                    confirmed.closedAt !== state.closedAt ||
                    value?.name !== target ||
                    !(Date.parse(value.updatedAt) >= Date.parse(state.closedAt!))
                )
                    throw new ReleaseError(
                        'Нет подтверждения Status для текущего закрытия; повторите Board',
                    );
            }
            console.log(
                `issue #${linked.number}, PR #${state.closer.number}, releases ${current.published
                    .filter((release) => release.prNumbers.includes(state.closer!.number))
                    .map((release) => release.sha)
                    .join(',')}: ${status} → ${target}`,
            );
            result.changed++;
            return;
        }
    };
    for (let pass = 0; pass < 3; pass++) {
        for (const linked of current.issues) {
            try {
                await processIssue(linked);
            } catch (error) {
                const message = `issue #${linked.number}: ${error instanceof Error ? error.message : String(error)}`;
                console.error(`::error::${message}`);
                result.errors.push(message);
            }
        }
        const nextProduction = await readProductionDeployments();
        if (JSON.stringify(nextProduction) === JSON.stringify(current.production)) return result;
        if (pass < 2) current = await readReleaseSnapshot(repoDir, nextProduction);
    }
    result.errors.push('История production менялась три прохода подряд; повторите синхронизацию');
    return result;
}
