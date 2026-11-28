import { createBrowserHistory, type RouterHistory } from '@cdd-team/router';

const QUESTION = 'Изменения не сохранены. Уйти со страницы?';

/** Адрес страницы с несохранёнными изменениями. */
let guarded: string | undefined;

const warnUnload = (event: Event) => event.preventDefault();

/**
 * Включает или снимает предупреждение об уходе с текущей страницы: переходы внутри SPA,
 * «назад», перезагрузка и закрытие вкладки.
 */
export function setUnsaved(unsaved: boolean): void {
    guarded = unsaved ? window.location.href : undefined;
    if (unsaved) window.addEventListener('beforeunload', warnUnload);
    else window.removeEventListener('beforeunload', warnUnload);
}

/** Можно ли открыть адрес: без изменений, на той же странице или с согласия пользователя. */
function canLeave(href: string): boolean {
    if (!guarded) return true;
    if (new URL(href, guarded).pathname === new URL(guarded).pathname) return true;
    if (!window.confirm(QUESTION)) return false;
    setUnsaved(false);
    return true;
}

const browser = createBrowserHistory();

/**
 * История роутера с предупреждением: у `@cdd-team/router` нет своего блокировщика. Отменённый
 * `push` не меняет адрес, и роутер остаётся на странице.
 */
export const guardedHistory: RouterHistory = {
    get location() {
        return browser.location;
    },
    push: (href, state) => {
        if (canLeave(href)) browser.push(href, state);
    },
    replace: (href, state) => {
        if (canLeave(href)) browser.replace(href, state);
    },
    go: (delta) => browser.go(delta),
    back: () => browser.back(),
    forward: () => browser.forward(),
    subscribe: (listener) =>
        browser.subscribe(() => {
            // popstate уже сменил адрес: при отказе возвращаем страницу новой записью
            const previous = guarded;
            if (canLeave(window.location.href)) listener();
            else if (previous) window.history.pushState(null, '', previous);
        }),
};
