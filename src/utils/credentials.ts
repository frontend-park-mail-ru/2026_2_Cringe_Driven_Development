import type { AuthError } from '../stores/session';

/** Ограничения из схемы Credentials в Apidog. */
const LOGIN_PATTERN = /^[a-zA-Z0-9_]+$/;
const LOGIN_MIN = 3;
const LOGIN_MAX = 32;
const PASSWORD_MAX = 72;

/** Минимальная длина пароля. */
export const PASSWORD_MIN = 8;

/**
 * Проверяет логин.
 * @param login логин
 * @returns текст ошибки или undefined, если логин подходит
 */
export function validateLogin(login: string): string | undefined {
    if (login === '') return 'Введите логин';
    if (login.length < LOGIN_MIN || login.length > LOGIN_MAX || !LOGIN_PATTERN.test(login)) {
        return 'От 3 до 32 символов: a–z, A–Z, 0–9, _';
    }
    return undefined;
}

/**
 * Проверяет пароль.
 * @param password пароль
 * @returns текст ошибки или undefined, если пароль подходит
 */
export function validatePassword(password: string): string | undefined {
    if (password === '') return 'Введите пароль';
    if (password.length < PASSWORD_MIN) return `Нужно не меньше ${PASSWORD_MIN} символов`;
    if (password.length > PASSWORD_MAX) return `Не больше ${PASSWORD_MAX} символов`;
    return undefined;
}

/**
 * Проверяет повтор пароля при регистрации.
 * @param password пароль
 * @param confirm повтор пароля
 * @returns текст ошибки или undefined, если пароли совпадают
 */
export function validateConfirm(password: string, confirm: string): string | undefined {
    if (confirm === '') return 'Повторите пароль';
    if (confirm !== password) return 'Пароли не совпадают';
    return undefined;
}

/**
 * Текст ошибки входа или регистрации для пользователя.
 * @param error ошибка
 * @returns текст ошибки
 */
export function authErrorMessage(error: AuthError): string {
    switch (error.code) {
        case 'invalid_credentials':
            return 'Неверный логин или пароль';
        case 'login_taken':
            return 'Этот логин уже занят. Войдите или выберите другой';
        case 'validation_error':
            return error.message ?? 'Проверьте логин и пароль';
        case 'network':
            return 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз';
        default:
            return 'Что-то пошло не так. Попробуйте ещё раз';
    }
}
