import { expect, test } from 'bun:test';

import { isAdminPage } from '../src/pages.ts';

test('admin SPA owns /onlineconf and nested paths only', () => {
    for (const path of ['/onlineconf', '/onlineconf/', '/onlineconf/keys']) {
        expect(isAdminPage(path)).toBe(true);
    }
    for (const path of ['/', '/login', '/onlineconfx', '/api/onlineconf/keys']) {
        expect(isAdminPage(path)).toBe(false);
    }
});
