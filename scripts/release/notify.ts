import { ReleaseError, need } from './env.ts';

/** Сообщение в Telegram о результате выкатки или отката */
export async function notify(what: string, status: string, sha?: string): Promise<void> {
    const token = need('TELEGRAM_BOT_TOKEN');
    const chat = need('TELEGRAM_CHAT_ID');
    const topic = process.env.TELEGRAM_TOPIC_ID;
    const { GITHUB_ACTOR, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;

    const lines = [
        status === 'success'
            ? `✅ ${what} фронта: успешно`
            : status === 'cancelled'
              ? `⚪ ${what} фронта: отменено`
              : `❌ ${what} фронта: ошибка`,
    ];
    if (sha) lines.push(`Релиз <code>${sha}</code>`);
    if (GITHUB_ACTOR) lines.push(`Запустил: ${GITHUB_ACTOR}`);
    const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const run = `${server}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;

    const api = process.env.TELEGRAM_API || 'https://api.telegram.org';
    const res = await fetch(`${api}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chat,
            text: lines.join('\n'),
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: 'Запуск', url: run }]] },
            ...(topic ? { message_thread_id: Number(topic) } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ReleaseError(`Telegram не принял сообщение: ответ ${res.status}`);
}
