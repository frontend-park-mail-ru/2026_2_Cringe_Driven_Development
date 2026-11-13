// Вручную поддерживаемые общие схемы входов — поверх generated zod.ts, который не правится
import { RegisterUserBody, UpdateCurrentUserBody } from './zod.ts';

/**
 * Password контракта Go: 8–72 печатных ASCII-символа без пробелов. Одно определение для браузера
 * и BFF; во всех пяти полях паролей контракт ссылается на тот же компонент.
 */
export const Password = RegisterUserBody.shape.password;

/** Требование к паролю для подсказок и ошибок, с длинами из контракта. */
export const PASSWORD_RULE = `${Password.minLength}–${Password.maxLength} символов: латиница, цифры и спецсимволы, без пробелов`;

/** Логин регистрации и входа: у `auth.register` и `auth.login` в контракте одно правило. */
export const Login = RegisterUserBody.shape.login;

/** Новый логин в профиле — правило операции обновления профиля (`users.update`). */
export const ProfileLogin = UpdateCurrentUserBody.shape.login;

/** Требование к логину для подсказок и ошибок, с длинами из контракта. */
export const LOGIN_RULE = `От ${Login.minLength} до ${Login.maxLength} символов: a–z, A–Z, 0–9 и _`;
