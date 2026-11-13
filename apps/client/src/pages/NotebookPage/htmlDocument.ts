/**
 * Базовое оформление HTML-вывода под тёмную тему. Переменные и стили страницы в iframe не
 * наследуются, поэтому значения токенов из `styles/tokens.css` повторены здесь. Все селекторы в
 * `:where()` — нулевая специфичность: стили библиотеки или пользователя ниже по документу побеждают.
 */
const BASE_CSS = `
:where(html) {
    color-scheme: dark;
    background: transparent;
    color: #cfc8f2; /* --code-text */
    font: 400 14px / 20px 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace; /* --font-code */
}
:where(body) {
    margin: 0;
    padding: 8px;
}
:where(a) {
    color: #8b6cff; /* --color-primary-text */
}
:where(.dataframe) {
    border: 0;
    border-collapse: collapse;
}
:where(.dataframe th, .dataframe td) {
    padding: 4px 12px;
    border: 0;
}
:where(.dataframe th) {
    color: #ece9ff; /* --color-text-primary */
    font-weight: 600;
}
:where(.dataframe thead th) {
    border-bottom: 1px solid rgb(255 255 255 / 0.16); /* --color-border-hover */
}
:where(.dataframe tbody tr:nth-child(even)) {
    background: rgb(255 255 255 / 0.04); /* --color-surface */
}
`;

/** Документ для srcdoc: базовые стили перед HTML результата, чтобы его стили шли позже. */
export const htmlDocument = (html: string) => `<style>${BASE_CSS}</style>${html}`;
