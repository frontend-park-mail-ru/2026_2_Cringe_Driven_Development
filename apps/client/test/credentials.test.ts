import { expect, test } from 'bun:test';
import { passwordRules, validateNewPassword } from '@utils/credentials';

const met = (current: string, next: string, confirm: string) =>
    passwordRules(current, next, confirm).map((rule) => rule.met);

test('требования к паролю: пустые поля не выполняют ни одного', () => {
    expect(met('', '', '')).toEqual([false, false, false]);
});

test('требования к паролю: длина, отличие от текущего и совпадение с повтором', () => {
    expect(met('old-password', 'new-password', 'new-password')).toEqual([true, true, true]);
    expect(met('old-password', 'old-password', 'other')).toEqual([true, false, false]);
    expect(met('old-password', 'short', 'short')).toEqual([false, true, true]);
});

test('новый пароль: правила регистрации и отличие от текущего', () => {
    expect(validateNewPassword('old-password', 'new-password')).toBeUndefined();
    expect(validateNewPassword('old-password', 'old-password')).toBe('Совпадает с текущим паролем');
    expect(validateNewPassword('old-password', 'short')).toBeDefined();
});
