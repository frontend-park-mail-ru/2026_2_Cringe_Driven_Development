// Копия контракта Go из backend по полному Git SHA: spec/identity/openapi.json и spec/workspace/openapi.json и манифест spec/contract-source.json.
// Redocly проверяет спеку в CI backend; здесь только копия.
// fetch [ветка] — определить SHA ветки backend (по умолчанию main), скачать спеку по этому SHA
// и только после успешного скачивания заменить копию и записать SHA в манифест;
// verify — побайтово сверить копию с backend по SHA из манифеста.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = join(import.meta.dir, '../..');
const SPEC_DIR = join(root, 'spec');
const MANIFEST = join(SPEC_DIR, 'contract-source.json');
const REPOSITORY = 'Cringe-Driven-Development-Team/backend';
const SOURCE_DIR = 'spec';
const specs = ['identity', 'workspace'].map((service) => `${service}/openapi.json`);
const DEFAULT_BRANCH = 'main';

interface Manifest {
    repository: string;
    path: string;
    revision: string;
}

function requireSha(raw: string | undefined): string {
    if (!raw || !/^[0-9a-f]{40}$/.test(raw)) {
        throw new Error(`нужен полный Git SHA backend (40 hex), получено «${raw ?? ''}»`);
    }
    return raw;
}

async function download(sha: string, spec: string): Promise<Uint8Array> {
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${SOURCE_DIR}/${spec}`;
    const response = await fetch(url);
    if (response.status !== 200) {
        throw new Error(`${SOURCE_DIR}/${spec} на ${sha}: GitHub ответил ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

/** SHA последнего коммита ветки backend на GitHub. */
async function branchSha(branch: string): Promise<string> {
    const url = `https://api.github.com/repos/${REPOSITORY}/branches/${encodeURIComponent(branch)}`;
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (response.status !== 200) {
        throw new Error(`ветка ${branch} backend: GitHub ответил ${response.status}`);
    }
    const body = (await response.json()) as { commit?: { sha?: string } };
    return requireSha(body.commit?.sha);
}

async function fetchSpec(branch: string): Promise<void> {
    const sha = await branchSha(branch);
    const contents = await Promise.all(specs.map((spec) => download(sha, spec)));
    for (const [index, spec] of specs.entries()) {
        await mkdir(dirname(join(SPEC_DIR, spec)), { recursive: true });
        await writeFile(join(SPEC_DIR, spec), contents[index]!);
    }
    const manifest: Manifest = { repository: REPOSITORY, path: SOURCE_DIR, revision: sha };
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`);
    console.error(
        `contract: контракты сервисов ← ${REPOSITORY}@${sha} (${branch}); дальше правка types.ts по диффу спеки`,
    );
}

async function verify(): Promise<void> {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as Partial<Manifest>;
    if (manifest.repository !== REPOSITORY || manifest.path !== SOURCE_DIR) {
        throw new Error(`манифест должен указывать ${REPOSITORY}, путь ${SOURCE_DIR}`);
    }
    const sha = requireSha(manifest.revision);
    for (const spec of specs) {
        const local = await readFile(join(SPEC_DIR, spec));
        if (!local.equals(Buffer.from(await download(sha, spec)))) {
            throw new Error(`spec/${spec} не совпадает с ${REPOSITORY}@${sha}`);
        }
        console.error(`contract: spec/${spec} совпадает с ${REPOSITORY}@${sha}`);
    }
}

try {
    const [command, branch = DEFAULT_BRANCH] = process.argv.slice(2);
    if (command === 'fetch') await fetchSpec(branch);
    else if (command === 'verify') await verify();
    else throw new Error('использование: backend.ts fetch [ветка] | verify');
} catch (error) {
    console.error('contract:', error instanceof Error ? error.message : String(error));
    process.exit(1);
}
