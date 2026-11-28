const keyNamePattern = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;

/**
 * Проверяет имя без пробелов по краям и его принадлежность выбранному скоупу.
 * @returns текст ошибки поля или undefined
 */
export function keyNameError(name: string, scope: string): string | undefined {
    if (name.length > 256 || !keyNamePattern.test(name)) {
        return 'Латиница, цифры, «.» и «_»';
    }
    if (!name.startsWith(scope + '.')) {
        return 'Название начинается с «' + scope + '.»';
    }
}
