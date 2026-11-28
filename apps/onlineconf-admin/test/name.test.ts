/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { keyNameError } from '../src/keys/name';

test('name must start with scope and use allowed characters', () => {
    expect(keyNameError('frontend.maintenance_banner', 'frontend')).toBeUndefined();
    expect(keyNameError('bff.a.b_2', 'bff')).toBeUndefined();
    for (const name of [
        '',
        'frontend',
        'frontend.',
        'bff.x',
        'frontend..x',
        'frontend.баннер',
        'frontend.a-b',
        'frontend.' + 'a'.repeat(256),
    ]) {
        expect(keyNameError(name, 'frontend')).toBeString();
    }
});
