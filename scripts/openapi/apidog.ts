// Выгружает спецификацию OpenAPI из Apidog в spec/openapi.json.
// Токен берётся из APIDOG_TOKEN, sprint-ветка — из APIDOG_BRANCH_ID (пусто — main).
// Bun сам читает .env, поэтому export в оболочке не нужен.

const EXPORT_URL = 'https://api.apidog.com/v1/projects/1382426/export-openapi';
const SPEC_PATH = 'spec/openapi.json';
const API_VERSION = '2024-03-28';
const MAX_ERROR_BODY = 512;

function requireToken(raw: string | undefined): string {
    if (!raw) {
        throw new Error(
            'не задан APIDOG_TOKEN: создай личный токен в Apidog ' +
                '(Account Settings → API Access Token) и впиши его в .env, см. README',
        );
    }
    return raw;
}

function parseBranchId(raw: string | undefined): number | undefined {
    if (raw === undefined || raw === '') return undefined;
    const id = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id <= 0) {
        throw new Error(
            `APIDOG_BRANCH_ID должен быть положительным целым числом, получено «${raw}»`,
        );
    }
    return id;
}

function isOpenApi(text: string): boolean {
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null && 'openapi' in parsed;
    } catch {
        return false;
    }
}

async function exportSpec(token: string, branchId: number | undefined): Promise<string> {
    const body = {
        scope: { type: 'ALL' },
        options: { includeApidogExtensionProperties: false, addFoldersToTags: false },
        oasVersion: '3.1',
        exportFormat: 'JSON',
        ...(branchId === undefined ? {} : { branchId }),
    };

    const response = await fetch(EXPORT_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'X-Apidog-Api-Version': API_VERSION,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    const head = text.slice(0, MAX_ERROR_BODY).trim();

    if (response.status === 401 || response.status === 403) {
        throw new Error(`Apidog отклонил токен (${response.status}): проверь APIDOG_TOKEN`);
    }
    if (response.status !== 200) {
        throw new Error(`Apidog ответил ${response.status}: ${head}`);
    }
    if (!isOpenApi(text)) {
        throw new Error(`Apidog вернул не OpenAPI-спецификацию: ${head}`);
    }
    return text;
}

try {
    const token = requireToken(process.env.APIDOG_TOKEN);
    const branchId = parseBranchId(process.env.APIDOG_BRANCH_ID);
    await Bun.write(SPEC_PATH, await exportSpec(token, branchId));
    const branch = branchId === undefined ? 'main' : `sprint-ветка ${branchId}`;
    console.error(`apidog: выгружена ветка ${branch} → ${SPEC_PATH}`);
} catch (error) {
    console.error('apidog:', error instanceof Error ? error.message : String(error));
    process.exit(1);
}
