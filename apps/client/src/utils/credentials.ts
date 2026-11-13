import { Login, LOGIN_RULE, Password, PASSWORD_RULE } from '@cdd/schemas/inputs';
import type { AuthError } from '@stores/session';

/** Вход или регистрация. */
export type AuthMode = 'login' | 'register';

export { LOGIN_RULE, PASSWORD_RULE };

/**
 * Проверяет логин.
 * @param login логин
 * @param schema схема операции: по умолчанию вход и регистрация, в профиле — `ProfileLogin`
 * @returns текст ошибки или undefined, если логин подходит
 */
export function validateLogin(login: string, schema = Login): string | undefined {
    if (login === '') return 'Введите логин';
    return schema.safeParse(login).success ? undefined : LOGIN_RULE;
}

/**
 * Проверяет пароль.
 * @returns текст ошибки или undefined, если пароль подходит
 */
export function validatePassword(password: string): string | undefined {
    if (password === '') return 'Введите пароль';
    const issues = Password.safeParse(password).error?.issues ?? [];
    if (issues.length === 0) return undefined;
    if (issues.some((issue) => issue.code === 'invalid_format')) {
        return 'Только латиница, цифры и спецсимволы, без пробелов';
    }
    return issues[0]!.code === 'too_small'
        ? `Нужно не меньше ${Password.minLength} символов`
        : `Не больше ${Password.maxLength} символов`;
}

/**
 * Проверяет повтор пароля при регистрации.
 * @returns текст ошибки или undefined, если пароли совпадают
 */
export function validateConfirm(password: string, confirm: string): string | undefined {
    if (confirm === '') return 'Повторите пароль';
    if (confirm !== password) return 'Пароли не совпадают';
    return undefined;
}

/**
 * Проверяет новый пароль при смене.
 * @param current текущий пароль
 * @param next новый пароль
 * @returns текст ошибки или undefined, если пароль подходит
 */
export function validateNewPassword(current: string, next: string): string | undefined {
    return validatePassword(next) ?? (next === current ? 'Совпадает с текущим паролем' : undefined);
}

/**
 * Требования к новому паролю из макета и их выполнение: пустые поля требование не выполняют.
 * @param current текущий пароль
 * @param next новый пароль
 * @param confirm повтор нового пароля
 * @returns список требований: текст и выполнено ли оно
 */
export function passwordRules(current: string, next: string, confirm: string) {
    return [
        { text: PASSWORD_RULE, met: Password.safeParse(next).success },
        {
            text: 'Отличается от текущего пароля',
            met: current !== '' && next !== '' && next !== current,
        },
        { text: 'Новый пароль и повтор совпадают', met: next !== '' && next === confirm },
    ];
}

/** Текст ошибки входа или регистрации для пользователя. */
export function authErrorMessage(error: AuthError, mode: AuthMode): string {
    switch (error.code) {
        case 'invalid_credentials':
            return 'Неверный логин или пароль';
        case 'invalid_totp':
            return 'Неверный код. Попробуйте ещё раз';
        case 'login_taken':
            return 'Логин уже занят. Выберите другой';
        case 'validation_error':
            return error.message ?? 'Проверьте логин и пароль';
        case 'network':
            return 'Нет связи с сервером';
        default:
            return mode === 'register' ? 'Не удалось создать аккаунт' : 'Не удалось войти';
    }
}
