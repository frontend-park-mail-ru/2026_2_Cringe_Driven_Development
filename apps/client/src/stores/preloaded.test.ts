import { expect, test } from 'bun:test';

import { setPreloadedSettings, takePreloadedSettings } from './preloaded';

const user = { id: 1, login: 'a', avatar_url: null, has_2fa: false };
const settings = { notebook_max_cells: 3, notebook_run_all: false };

test('OnlineConf snapshot is taken once, only for the initial session and address', () => {
    setPreloadedSettings(settings, user, '/notebooks/1');
    expect(takePreloadedSettings(user, '/notebooks/1')).toEqual({ value: settings });
    // повторное открытие — уже через BFF
    expect(takePreloadedSettings(user, '/notebooks/1')).toBeUndefined();

    setPreloadedSettings(settings, user, '/notebooks/1');
    expect(takePreloadedSettings(user, '/')).toBeUndefined();
    expect(takePreloadedSettings(user, '/notebooks/1')).toBeUndefined();

    // другой вход того же пользователя — другой объект: снимок прежней сессии не отдаётся
    setPreloadedSettings(settings, user, '/');
    expect(takePreloadedSettings({ ...user }, '/')).toBeUndefined();

    setPreloadedSettings(null, user, '/');
    expect(takePreloadedSettings(user, '/')).toEqual({ value: null });

    setPreloadedSettings(settings, null, '/');
    expect(takePreloadedSettings(null, '/')).toBeUndefined();
});
