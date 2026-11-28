import type { OnlineConfRolloutPolicy } from '@cdd/schemas/types';

/**
 * Проценты, которые можно выбрать в форме флага по серверному регламенту: любые ступени ниже
 * сохранённого процента (снижение сразу), сам сохранённый процент — даже нестандартный — и
 * следующая ступень, если сервер её предлагает.
 * @param saved сохранённый процент раскатки
 * @param policy регламент из карточки флага
 */
export function rolloutChoices(saved: number, policy: OnlineConfRolloutPolicy): number[] {
    const lower = policy.stages.filter((stage) => stage < saved);
    return policy.next_percent === null
        ? [...lower, saved]
        : [...lower, saved, policy.next_percent];
}

/**
 * Подсказка о следующем шаге раскатки. Время клиента — только подсказка: решение принимает сервер.
 * @param enabled флаг включён по сохранённым данным
 * @param saved сохранённый процент
 * @param policy регламент из карточки флага
 * @param now текущее время клиента, мс
 * @returns текст и признак, что повышение пока недоступно
 */
export function rolloutHint(
    enabled: boolean,
    saved: number,
    policy: OnlineConfRolloutPolicy,
    now: number,
): { text: string; waiting: boolean } {
    const next = policy.next_percent;
    if (next === null) {
        if (!enabled) {
            return {
                text: 'Повышать процент можно у включённого флага: включите флаг и сохраните.',
                waiting: false,
            };
        }
        return { text: saved >= 100 ? 'Флаг раскатан на всех.' : '', waiting: false };
    }
    const at = policy.next_allowed_at === null ? undefined : Date.parse(policy.next_allowed_at);
    if (at !== undefined && now < at) {
        const clock = new Date(at).toLocaleTimeString('ru');
        return {
            text: `Следующий шаг — ${next}%, доступен с ${clock}: на каждой ступени нужна минута выдержки.`,
            waiting: true,
        };
    }
    return { text: `Следующий шаг — ${next}%. Повышение только вручную.`, waiting: false };
}
