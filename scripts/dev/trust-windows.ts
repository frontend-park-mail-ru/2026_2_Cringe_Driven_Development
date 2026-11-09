// Разовое доверие CA mkcert в Windows при разработке из WSL: Vite и mkcert работают в Ubuntu и
// ставят CA туда, а Chrome в Windows смотрит в хранилище Windows. Скрипт добавляет публичный
// rootCA.pem в CurrentUser\Root после подтверждения; ключ CA (rootCA-key.pem) из WSL не уходит.
// Повторный запуск, когда CA уже там, ничего не меняет. На macOS и в нативной Windows не нужен.
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const wsl =
    Boolean(process.env.WSL_DISTRO_NAME) || existsSync('/proc/sys/fs/binfmt_misc/WSLInterop');
if (!wsl) {
    console.log(
        'Нужен только в WSL: на macOS и в Windows CA добавляет в доверенные сам bun run dev',
    );
    process.exit(0);
}

const caFile = join(homedir(), '.vite-plugin-mkcert', 'rootCA.pem');
if (!existsSync(caFile)) {
    console.error(`Нет ${caFile}: сначала один раз запустите bun run dev, он создаст CA`);
    process.exit(1);
}
const ca = new X509Certificate(readFileSync(caFile));
if (!ca.ca) {
    console.error(`${caFile} — не сертификат CA`);
    process.exit(1);
}
/** Thumbprint в Windows — SHA-1 сертификата без двоеточий. */
const thumbprint = ca.fingerprint.replaceAll(':', '');

/**
 * Команда PowerShell в Windows через interop WSL.
 * @returns вывод команды без пробелов по краям
 */
function powershell(command: string): string {
    const proc = Bun.spawnSync(
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command],
        { stdout: 'pipe', stderr: 'pipe' },
    );
    if (proc.exitCode !== 0) {
        throw new Error(`powershell.exe завершился с кодом ${proc.exitCode}: ${proc.stderr}`);
    }
    return proc.stdout.toString().trim();
}

const trusted = () => powershell(`Test-Path Cert:\\CurrentUser\\Root\\${thumbprint}`) === 'True';

if (trusted()) {
    console.log('CA mkcert уже в доверенных Windows (CurrentUser\\Root) — ничего не меняю');
    process.exit(0);
}

console.log(`CA mkcert: ${caFile}\n${ca.subject.replaceAll('\n', ', ')}\nSHA-1 ${ca.fingerprint}`);
const answer = prompt('Добавить его в доверенные корневые сертификаты пользователя Windows? [y/N]');
if (!/^(y|yes|д|да)$/i.test(answer?.trim() ?? '')) {
    console.log('Отменено: CA не добавлен');
    process.exit(1);
}

/** В PowerShell — только публичный сертификат (DER в base64); подтверждение спросит Windows. */
const der = ca.raw.toString('base64');
try {
    powershell(
        [
            "$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root', 'CurrentUser')",
            "$store.Open('ReadWrite')",
            `$store.Add([System.Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String('${der}')))`,
            '$store.Close()',
        ].join('; '),
    );
} catch (error) {
    console.error(`CA не добавлен — возможно, отказ в окне Windows.\n${String(error)}`);
    process.exit(1);
}
if (!trusted()) {
    console.error('После добавления CA не виден в CurrentUser\\Root');
    process.exit(1);
}
console.log(
    'Готово: Chrome в Windows доверяет https://localhost:5173. Если предупреждение осталось — перезапустите Chrome',
);
