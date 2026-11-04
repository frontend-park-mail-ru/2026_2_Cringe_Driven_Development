import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function command(scenario: string) {
    const dir = mkdtempSync(join(tmpdir(), 'release-cli-'));
    const script = join(dir, 'run.ts');
    writeFileSync(
        script,
        `
        import { fixture, REPO } from ${JSON.stringify(join(import.meta.dir, 'test/fixture.ts'))};
        import { writeFileSync } from 'node:fs';
        const f = fixture();
        const scenario = ${JSON.stringify(scenario)};
        process.chdir(f.dir);
        process.env.GITHUB_STEP_SUMMARY = ${JSON.stringify(join(dir, 'summary.md'))};
        process.env.GITHUB_OUTPUT = ${JSON.stringify(join(dir, 'output'))};
        process.env.RELEASE_REPORT_FILE = ${JSON.stringify(join(dir, 'report.json'))};
        const report = {baseSha:f.a,headSha:f.b,complete:scenario !== 'incomplete',prs:[],issues:[]};
        if(scenario === 'api-error') {
            report.prs.push({number:2,title:'PR 2',url:'https://github.com/'+REPO+'/pull/2',mergeSha:f.b});
            report.issues.push({id:'I2',number:2,title:'Issue 2',repo:REPO,prNumbers:[2]});
            f.extra = () => new Response('unavailable', {status:503});
        }
        writeFileSync(process.env.RELEASE_REPORT_FILE, JSON.stringify({kind:'deploy',sha:f.b,report}));
        process.env.RELEASE_BEFORE_SHA = f.b;
        process.argv = ['bun', 'release', ...(scenario === 'wrong-direction' ? ['direction','deploy',f.a] : ['board','deploy',f.b])];
        process.on('exit', () => {
            writeFileSync(${JSON.stringify(join(dir, 'requests.json'))}, JSON.stringify(f.requests.map(r => ({path:r.url.pathname, method:r.init?.method || 'GET'}))));
            f.restore();
        });
        await import(${JSON.stringify(join(import.meta.dir, 'index.ts'))});
    `,
    );
    const child = Bun.spawnSync([process.execPath, script], { env: process.env });
    const summary = Bun.file(join(dir, 'summary.md'));
    return {
        dir,
        child,
        summary,
        requests: JSON.parse(readFileSync(join(dir, 'requests.json'), 'utf8')) as {
            path: string;
            method: string;
        }[],
    };
}

test.each(['empty', 'incomplete', 'api-error'])(
    'board CLI separates successful operation from card result: %s',
    async (scenario) => {
        const result = command(scenario);
        try {
            expect(result.child.exitCode).toBe(scenario === 'empty' ? 0 : 1);
            const summary = await result.summary.text();
            expect(summary).toContain('Операция успешна');
            if (scenario === 'empty') expect(summary).toContain('Изменено: 0');
            else {
                expect(summary).toContain('обновление карточек не завершено');
                expect(result.child.stderr.toString()).toContain(
                    'обновление карточек не завершено',
                );
            }
            expect(result.requests.some((r) => r.path.includes('/deployments'))).toBe(false);
            if (scenario !== 'api-error') expect(result.requests).toEqual([]);
        } finally {
            rmSync(result.dir, { recursive: true, force: true });
        }
    },
);

test('direction CLI uses RELEASE_BEFORE_SHA and rejects backward CD without network', () => {
    const result = command('wrong-direction');
    try {
        expect(result.child.exitCode).toBe(1);
        expect(result.child.stderr.toString()).toContain('Неверное направление deploy');
        expect(result.requests).toEqual([]);
    } finally {
        rmSync(result.dir, { recursive: true, force: true });
    }
});
