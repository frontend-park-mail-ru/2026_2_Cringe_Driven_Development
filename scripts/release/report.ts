import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { linkedIssues, type LinkedIssue } from './catalog.ts';
import { checkSha, isSha, need, output, ReleaseError } from './env.ts';
import { api, runUrl } from './github.ts';
import { listReleases, tagOf, verifyRelease } from './releases.ts';

/** Состав конкретного диапазона, независимо от Telegram и доски. */
export interface ChangeReport {
    baseSha: string | null;
    headSha: string;
    prs: { number: number; title: string; url: string; mergeSha: string }[];
    issues: LinkedIssue[];
    complete: boolean;
}

/** Операция, для которой подготовлен локальный отчёт. */
export type ReleaseKind = 'publish' | 'deploy' | 'rollback';

/** Состав одной операции в текущем job, без повторного чтения GitHub. */
export interface OperationReport {
    kind: ReleaseKind;
    sha: string;
    report: ChangeReport;
}

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validSha(value: unknown): value is string {
    return typeof value === 'string' && isSha(value);
}

/** Читает полный отчёт текущей операции из обязательного локального файла, без сети. */
export async function readOperationReport(kind: ReleaseKind, sha: string): Promise<ChangeReport> {
    checkSha(sha);
    const operation: unknown = JSON.parse(readFileSync(need('RELEASE_REPORT_FILE'), 'utf8'));
    if (!object(operation) || operation.kind !== kind || operation.sha !== sha)
        throw new ReleaseError('Локальный отчёт относится к другой операции');
    const report = operation.report;
    if (
        !object(report) ||
        report.complete !== true ||
        !validSha(report.baseSha) ||
        !validSha(report.headSha) ||
        (kind === 'rollback' ? report.baseSha !== sha : report.headSha !== sha) ||
        !Array.isArray(report.prs) ||
        !report.prs.every(
            (pr: unknown) =>
                object(pr) &&
                positiveNumber(pr.number) &&
                typeof pr.title === 'string' &&
                typeof pr.url === 'string' &&
                validSha(pr.mergeSha),
        ) ||
        !Array.isArray(report.issues) ||
        !report.issues.every(
            (issue: unknown) =>
                object(issue) &&
                typeof issue.id === 'string' &&
                issue.id.length > 0 &&
                positiveNumber(issue.number) &&
                typeof issue.title === 'string' &&
                typeof issue.repo === 'string' &&
                issue.repo.length > 0 &&
                Array.isArray(issue.prNumbers) &&
                issue.prNumbers.every(positiveNumber),
        )
    )
        throw new ReleaseError('Неполный или некорректный локальный отчёт операции');
    return report as unknown as ChangeReport;
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
    if (baseSha === headSha) return { ...report, complete: true };
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

/** Строки состава изменений: диапазон, сравнение, PR и закрытые ими задачи. */
function changeLines(report: ChangeReport): string[] {
    const repo = need('GITHUB_REPOSITORY');
    const lines = [`${report.baseSha ?? 'база неизвестна'} → ${report.headSha}`];
    if (!report.complete) {
        lines.push('Отчёт неполный: состав изменений недоступен');
        return lines;
    }
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
    return lines;
}

/** Публикует полный отчёт в Summary текущего шага, без сетевых отправок. */
export function writeChangeSummary(report: ChangeReport): string | null {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (!path) return null;
    appendFileSync(path, `${['## Состав выпуска', ...changeLines(report)].join('\n\n')}\n`);
    return report.complete ? `${runUrl()}#summary` : null;
}

/**
 * Описание GitHub Release: SHA, изменения, CI, pull по digest и проверка архивов. Неполный отчёт
 * показывается явно; описание редактируемое и состав не доказывает.
 * @param sha полный SHA
 * @param imageRef образ по digest
 * @param ciRun run исходной сборки
 * @param [report] отчёт публикации; undefined — состав недоступен
 * @returns Markdown
 */
export function releaseBody(
    sha: string,
    imageRef: string,
    ciRun: string,
    report?: ChangeReport,
): string {
    return [
        `SHA: \`${sha}\``,
        '## Изменения',
        ...(report ? changeLines(report) : ['Отчёт неполный: состав изменений недоступен']),
        '## Сборка',
        `CI: ${ciRun}`,
        `Образ BFF: \`docker pull ${imageRef}\``,
        '## Проверка архивов',
        [
            '```sh',
            'sha256sum -c SHA256SUMS',
            'gunzip -c bff-image.tar.gz | docker load',
            'mkdir dist && tar -xzf frontend-dist.tar.gz -C dist',
            '```',
        ].join('\n'),
        'Состав и происхождение — в `release.json`. Автоматические Source code (zip/tar.gz) — ' +
            'исходники, не сборка выпуска.',
    ].join('\n\n');
}

/** Ближайший first-parent предок с опубликованным Release и проверенным manifest. */
async function publicationBase(sha: string, repoDir: string): Promise<string | null> {
    const git = Bun.spawnSync(['git', 'rev-list', '--first-parent', checkSha(sha)], {
        cwd: repoDir,
    });
    if (git.exitCode) throw new ReleaseError('Не удалось прочитать предков выпуска');
    const ancestors = git.stdout.toString().trim().split('\n').slice(1);
    const releases = new Map(
        (await listReleases())
            .filter((release) => !release.draft)
            .map((release) => [release.tag_name, release]),
    );
    for (const ancestor of ancestors) {
        const release = releases.get(tagOf(ancestor));
        if (release) {
            await verifyRelease(release, ancestor);
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
    let report: ChangeReport;
    try {
        baseSha =
            kind === 'publish'
                ? await publicationBase(sha, repoDir)
                : process.env.RELEASE_BEFORE_SHA
                  ? checkSha(process.env.RELEASE_BEFORE_SHA)
                  : null;
        const head = kind === 'rollback' ? baseSha : sha;
        const base = kind === 'rollback' ? sha : baseSha;
        report = head
            ? await readChangeReport(need('GITHUB_REPOSITORY'), base, head)
            : { baseSha: null, headSha: sha, prs: [], issues: [], complete: false };
        reportUrl = writeChangeSummary(report);
    } catch {
        console.warn(
            '::warning::Состав выпуска недоступен; результат операции сохраняется без полного отчёта',
        );
        report = {
            baseSha: kind === 'rollback' ? sha : baseSha,
            headSha: kind === 'rollback' && baseSha ? baseSha : sha,
            prs: [],
            issues: [],
            complete: false,
        };
        try {
            writeChangeSummary(report);
        } catch {
            console.warn('::warning::Не удалось записать неполный Summary');
        }
    }
    if (process.env.RELEASE_REPORT_FILE) {
        const operation: OperationReport = { kind: kind as ReleaseKind, sha, report };
        writeFileSync(process.env.RELEASE_REPORT_FILE, JSON.stringify(operation));
    }
    output('report_base_sha', baseSha ?? '');
    output('report_url', reportUrl ?? '');
}
