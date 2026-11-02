import { appendFileSync } from 'node:fs';
import { linkedIssues, readTrustedRun, type LinkedIssue } from './catalog.ts';
import { readyArtifacts } from './deployments.ts';
import { checkSha, need, output, ReleaseError } from './env.ts';
import { api, listDeployments, runUrl, type ArtifactsPayload } from './github.ts';

/** Состав конкретного диапазона, независимо от Telegram и доски. */
export interface ChangeReport {
    baseSha: string | null;
    headSha: string;
    prs: { number: number; title: string; url: string; mergeSha: string }[];
    issues: LinkedIssue[];
    complete: boolean;
}

/** Читает только PR фактического диапазона и их закрывающие связи. */
export async function readChangeReport(
    repo: string,
    baseSha: string | null,
    headSha: string,
): Promise<ChangeReport> {
    if (repo !== need('GITHUB_REPOSITORY')) throw new ReleaseError('Чужой репозиторий отчёта');
    const report: ChangeReport = {
        baseSha,
        headSha: checkSha(headSha),
        prs: [],
        issues: [],
        complete: false,
    };
    if (baseSha === null) return report;
    checkSha(baseSha);
    const commits = new Set<string>();
    for (let page = 1; ; page++) {
        const batch = await api<{ total_commits: number; commits: { sha: string }[] }>(
            `/compare/${baseSha}...${headSha}?per_page=100&page=${page}`,
        );
        if (
            !Number.isSafeInteger(batch.total_commits) ||
            batch.total_commits < 0 ||
            !Array.isArray(batch.commits)
        )
            throw new ReleaseError('Некорректный диапазон отчёта');
        const previous = commits.size;
        for (const commit of batch.commits) commits.add(checkSha(commit.sha));
        if (commits.size === batch.total_commits) break;
        if (commits.size <= previous || commits.size > batch.total_commits)
            throw new ReleaseError('Неполный диапазон отчёта');
    }
    const prs = new Map<number, ChangeReport['prs'][number]>();
    for (const commit of commits) {
        for (let page = 1; ; page++) {
            const rows = await api<
                {
                    number: number;
                    title: string;
                    merged_at: string | null;
                    merge_commit_sha: string | null;
                }[]
            >(`/commits/${commit}/pulls?per_page=100&page=${page}`);
            if (!Array.isArray(rows)) throw new ReleaseError('Некорректный список связанных PR');
            for (const row of rows) {
                if (!row.merged_at || !row.merge_commit_sha || !commits.has(row.merge_commit_sha))
                    continue;
                if (
                    !Number.isSafeInteger(row.number) ||
                    row.number <= 0 ||
                    typeof row.title !== 'string'
                )
                    throw new ReleaseError('Некорректный связанный PR');
                prs.set(row.number, {
                    number: row.number,
                    title: row.title,
                    url: `https://github.com/${repo}/pull/${row.number}`,
                    mergeSha: row.merge_commit_sha,
                });
            }
            if (rows.length < 100) break;
        }
    }
    report.prs = [...prs.values()].toSorted((a, b) => a.number - b.number);
    const issues = new Map<string, LinkedIssue>();
    for (const pr of report.prs) {
        for (const issue of await linkedIssues(pr.number)) {
            const existing = issues.get(issue.id);
            if (existing) existing.prNumbers.push(pr.number);
            else issues.set(issue.id, issue);
        }
    }
    report.issues = [...issues.values()];
    report.complete = true;
    return report;
}

function markdown(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replace(/[\\`*_[\]()]/g, '\\$&')
        .replace(/[\r\n]+/g, ' ');
}

/** Публикует полный отчёт в Summary текущего шага, без сетевых отправок. */
export function writeChangeSummary(report: ChangeReport): string | null {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (!path) return null;
    const repo = need('GITHUB_REPOSITORY');
    const lines = [
        '## Состав выпуска',
        `${report.baseSha ?? 'база неизвестна'} → ${report.headSha}`,
    ];
    if (!report.complete) lines.push('Отчёт неполный: состав изменений недоступен');
    else {
        lines.push(
            `[Сравнение версий](https://github.com/${repo}/compare/${report.baseSha}...${report.headSha})`,
        );
        for (const pr of report.prs) {
            lines.push(`- [#${pr.number}: ${markdown(pr.title)}](${pr.url})`);
            for (const issue of report.issues.filter((item) => item.prNumbers.includes(pr.number)))
                lines.push(
                    `  - [${markdown(issue.title)}](https://github.com/${issue.repo}/issues/${issue.number})`,
                );
        }
        if (!report.prs.length) lines.push('Связанных PR нет');
    }
    appendFileSync(path, `${lines.join('\n\n')}\n`);
    return report.complete ? `${runUrl()}#summary` : null;
}

async function publicationBase(sha: string, repoDir: string): Promise<string | null> {
    const git = Bun.spawnSync(['git', 'rev-list', '--first-parent', checkSha(sha)], {
        cwd: repoDir,
    });
    if (git.exitCode) throw new ReleaseError('Не удалось прочитать предков выпуска');
    const ancestors = git.stdout.toString().trim().split('\n').slice(1);
    const records = await listDeployments<ArtifactsPayload>('release-artifacts');
    for (const ancestor of ancestors) {
        const payload = readyArtifacts(records, ancestor);
        if (payload) {
            const run = await readTrustedRun(Number(payload.ci_run.split('/').at(-1)));
            if (run.kind !== 'publish' || run.url !== payload.ci_run || run.sha !== ancestor)
                throw new ReleaseError('Недоверенный источник базы отчёта');
            return ancestor;
        }
    }
    return null;
}

/** Готовит Summary и небольшие outputs для записи результата операции. */
export async function reportRelease(kind: string, sha: string, repoDir: string): Promise<void> {
    if (!['publish', 'deploy', 'rollback'].includes(kind))
        throw new ReleaseError('Неизвестный тип отчёта');
    checkSha(sha);
    let baseSha: string | null = null;
    let reportUrl: string | null = null;
    try {
        baseSha =
            kind === 'publish'
                ? await publicationBase(sha, repoDir)
                : process.env.RELEASE_BEFORE_SHA
                  ? checkSha(process.env.RELEASE_BEFORE_SHA)
                  : null;
        const head = kind === 'rollback' ? baseSha : sha;
        const base = kind === 'rollback' ? sha : baseSha;
        const report = head
            ? await readChangeReport(need('GITHUB_REPOSITORY'), base, head)
            : { baseSha: null, headSha: sha, prs: [], issues: [], complete: false };
        reportUrl = writeChangeSummary(report);
    } catch {
        console.warn(
            '::warning::Состав выпуска недоступен; результат операции сохраняется без полного отчёта',
        );
        try {
            writeChangeSummary({
                baseSha: kind === 'rollback' ? sha : baseSha,
                headSha: kind === 'rollback' && baseSha ? baseSha : sha,
                prs: [],
                issues: [],
                complete: false,
            });
        } catch {
            console.warn('::warning::Не удалось записать неполный Summary');
        }
    }
    output('report_base_sha', baseSha ?? '');
    output('report_url', reportUrl ?? '');
}
