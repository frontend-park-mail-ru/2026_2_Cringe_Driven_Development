// Тексты правил логина и пароля для форм; сами правила — в validate.ts, общие с BFF
import { LOGIN, PASSWORD } from './validate.ts';

/** Требование к паролю для подсказок и ошибок, с длинами из контракта. */
export const PASSWORD_RULE = `${PASSWORD.min}–${PASSWORD.max} символов: латиница, цифры и спецсимволы, без пробелов`;

/** Требование к логину для подсказок и ошибок, с длинами из контракта. */
export const LOGIN_RULE = `От ${LOGIN.min} до ${LOGIN.max} символов: a–z, A–Z, 0–9 и _`;
