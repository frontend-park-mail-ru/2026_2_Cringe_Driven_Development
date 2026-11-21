// Копия контракта Go из backend по полному Git SHA: spec/openapi.json и манифест spec/contract-source.json.
// Redocly проверяет спеку в CI backend; здесь только копия.
// fetch <sha> — скачать спеку и только после успешного скачивания заменить копию и манифест;
// verify — побайтово сверить копию с backend по SHA из манифеста.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const SPEC_DIR = join(root, 'spec');
const MANIFEST = join(SPEC_DIR, 'contract-source.json');
const REPOSITORY = 'Cringe-Driven-Development-Team/backend';
const SOURCE_DIR = 'spec';
const SPEC = 'openapi.json';

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

async function download(sha: string): Promise<Uint8Array> {
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${SOURCE_DIR}/${SPEC}`;
    const response = await fetch(url);
    if (response.status !== 200) {
        throw new Error(`${SOURCE_DIR}/${SPEC} на ${sha}: GitHub ответил ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

async function fetchSpec(sha: string): Promise<void> {
    const spec = await download(sha);
    await writeFile(join(SPEC_DIR, SPEC), spec);
    const manifest: Manifest = { repository: REPOSITORY, path: SOURCE_DIR, revision: sha };
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`);
    console.error(
        `contract: spec/${SPEC} ← ${REPOSITORY}@${sha}; дальше правка types.ts по диффу спеки`,
    );
}

async function verify(): Promise<void> {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as Partial<Manifest>;
    if (manifest.repository !== REPOSITORY || manifest.path !== SOURCE_DIR) {
        throw new Error(`манифест должен указывать ${REPOSITORY}, путь ${SOURCE_DIR}`);
    }
    const sha = requireSha(manifest.revision);
    const local = await readFile(join(SPEC_DIR, SPEC));
    if (!local.equals(Buffer.from(await download(sha)))) {
        throw new Error(`spec/${SPEC} не совпадает с ${REPOSITORY}@${sha}`);
    }
    console.error(`contract: spec/${SPEC} совпадает с ${REPOSITORY}@${sha}`);
}

try {
    const [command, sha] = process.argv.slice(2);
    if (command === 'fetch') await fetchSpec(requireSha(sha));
    else if (command === 'verify') await verify();
    else throw new Error('использование: backend.ts fetch <sha> | verify');
} catch (error) {
    console.error('contract:', error instanceof Error ? error.message : String(error));
    process.exit(1);
}
