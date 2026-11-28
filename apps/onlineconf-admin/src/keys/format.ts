import type { Output } from '@api/bff';

/** Области ключей OnlineConf. */
export const scopes = ['frontend', 'bff', 'identity', 'workspace'] as const;

/** Строка списка ключей OnlineConf. */
export type ConfItem = Output<'/api/onlineconf/keys/list'>['items'][number];

/** Компактное значение конфига или состояние флага с процентом раскатки. */
export function valuePreview(item: ConfItem): string {
    if (item.type === 'flag') {
        return `${item.enabled ? 'Вкл' : 'Выкл'} · ${item.rollout_percent}%`;
    }
    return JSON.stringify(item.value);
}
