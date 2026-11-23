import { confirmTwoFactorInput, disableTwoFactorInput } from '@cdd/schemas/validate';

import { route } from '../http.ts';

/**
 * 2FA текущего пользователя: данные настройки (QR и ключ), подтверждение кодом и отключение по
 * паролю. Ключ настройки BFF не хранит и не журналирует: он уходит клиенту в ответе `setup`.
 */
export const twoFactor = [
    /** Ответ с ключом настройки не кэшируется */
    route({
        method: 'POST',
        path: '/api/two-factor/setup',
        access: 'authed',
        noStore: true,
        handle: ({ go }) => go.enableTwoFactor(),
    }),
    route({
        method: 'POST',
        path: '/api/two-factor/confirm',
        access: 'authed',
        input: { from: 'json', validate: confirmTwoFactorInput },
        async handle({ go }, input) {
            await go.confirmTwoFactor(input);
            return { ok: true as const };
        },
    }),
    route({
        method: 'POST',
        path: '/api/two-factor/disable',
        access: 'authed',
        input: { from: 'json', validate: disableTwoFactorInput },
        async handle({ go }, input) {
            await go.disableTwoFactor(input);
            return { ok: true as const };
        },
    }),
] as const;
