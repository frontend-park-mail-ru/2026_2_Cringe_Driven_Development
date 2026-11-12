// Копия контракта Go из backend по полному Git SHA: spec/ и манифест spec/contract-source.json.
// fetch <sha> — скачать комплект, проверить его Redocly этой ревизии и только потом заменить копию;
// verify — сверить локальный комплект с файлами backend по закреплённому SHA.
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = join(import.meta.dir, '../..');
const SPEC_DIR = join(root, 'spec');
const MANIFEST = join(SPEC_DIR, 'contract-source.json');
const REPOSITORY = 'Cringe-Driven-Development-Team/backend';
const SOURCE_DIR = 'spec';
/** Комплект backend; пути относительно spec/, как в backend: redocly.yaml ссылается на ./plugins */
const FILES = [
    'openapi.json',
    'redocly.yaml',
    'plugins/defaults.js',
    'package.json',
    'package-lock.json',
];

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

async function download(sha: string, file: string): Promise<Uint8Array> {
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${SOURCE_DIR}/${file}`;
    const response = await fetch(url);
    if (response.status !== 200) {
        throw new Error(`${SOURCE_DIR}/${file} на ${sha}: GitHub ответил ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

/** Запускает команду в каталоге комплекта; ненулевой код — ошибка. */
async function run(cwd: string, cmd: string[]): Promise<void> {
    const proc = Bun.spawn(cmd, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    if ((await proc.exited) !== 0) throw new Error(`${cmd.join(' ')} завершился с ошибкой`);
}

async function fetchSet(sha: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'cdd-contract-'));
    try {
        for (const file of FILES) {
            await mkdir(dirname(join(dir, file)), { recursive: true });
            await writeFile(join(dir, file), await download(sha, file));
        }
        // Redocly и плагин — из той же ревизии, что и контракт
        await run(dir, ['npm', 'ci', '--no-audit', '--no-fund']);
        await run(dir, [
            'npx',
            '--no',
            'redocly',
            'lint',
            'openapi.json',
            '--config',
            'redocly.yaml',
        ]);
        for (const file of FILES) {
            await mkdir(dirname(join(SPEC_DIR, file)), { recursive: true });
            await copyFile(join(dir, file), join(SPEC_DIR, file));
        }
        const manifest: Manifest = { repository: REPOSITORY, path: SOURCE_DIR, revision: sha };
        await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
    console.error(
        `contract: spec/ ← ${REPOSITORY}@${sha}; дальше bun run contract:tools && bun run sync`,
    );
}

async function verify(): Promise<void> {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as Partial<Manifest>;
    if (manifest.repository !== REPOSITORY || manifest.path !== SOURCE_DIR) {
        throw new Error(`манифест должен указывать ${REPOSITORY}, путь ${SOURCE_DIR}`);
    }
    const sha = requireSha(manifest.revision);
    const changed: string[] = [];
    for (const file of FILES) {
        const local = new Uint8Array(await readFile(join(SPEC_DIR, file)));
        if (!Buffer.from(local).equals(Buffer.from(await download(sha, file)))) {
            changed.push(`spec/${file}`);
        }
    }
    if (changed.length > 0) {
        throw new Error(`не совпадают с ${REPOSITORY}@${sha}: ${changed.join(', ')}`);
    }
    console.error(`contract: spec/ совпадает с ${REPOSITORY}@${sha}`);
}

try {
    const [command, sha] = process.argv.slice(2);
    if (command === 'fetch') await fetchSet(requireSha(sha));
    else if (command === 'verify') await verify();
    else throw new Error('использование: backend.ts fetch <sha> | verify');
} catch (error) {
    console.error('contract:', error instanceof Error ? error.message : String(error));
    process.exit(1);
}
