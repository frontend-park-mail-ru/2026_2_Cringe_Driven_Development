import { expect, test } from 'bun:test';
import {
    authErrorMessage,
    passwordRules,
    validateNewPassword,
    validateTotp,
} from '@utils/credentials';

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

test('TOTP-код: ровно 6 цифр, ведущие нули допустимы', () => {
    expect(validateTotp('012345')).toBeUndefined();
    expect(validateTotp('')).toBe('Введите код');
    expect(validateTotp('12345')).toBe('Код — 6 цифр');
    expect(validateTotp('12345a')).toBe('Код — 6 цифр');
    expect(validateTotp(' 123456')).toBe('Код — 6 цифр');
});

test('неверный TOTP-код — своё сообщение', () => {
    expect(authErrorMessage({ code: 'invalid_totp' }, 'login')).toBe(
        'Неверный или уже использованный код',
    );
});
