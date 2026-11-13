// Вручную поддерживаемые общие схемы входов — поверх generated zod.ts, который не правится
import { RegisterUserBody } from './zod.ts';

/**
 * Password контракта Go: 8–72 печатных ASCII-символа без пробелов. Одно определение для браузера
 * и BFF; во всех пяти полях паролей контракт ссылается на тот же компонент.
 */
export const Password = RegisterUserBody.shape.password;

/** Требование к паролю для подсказок и ошибок, с длинами из контракта. */
export const PASSWORD_RULE = `${Password.minLength}–${Password.maxLength} символов: латиница, цифры и спецсимволы, без пробелов`;
