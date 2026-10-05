/**
 * Атрибуты, которых нет в JSX-типах @maninthecoat/react (autocomplete, autocapitalize,
 * spellcheck...).
 *
 * @example
 * <input {...domProps({ autocomplete: 'username', spellcheck: false })} />
 * @module utils/dom-props
 */

/** Значения, которые библиотека умеет выставить на DOM-узел. */
type DomPropValue = string | number | boolean | undefined;

/**
 * Пропускает атрибуты мимо проверки JSX-типов.
 * Имена пишутся так, как называется свойство DOM-узла (autocomplete, а не autoComplete).
 * @param {Record<string, DomPropValue>} props атрибуты и их значения
 * @returns {object} объект для spread в JSX-элемент
 */
export function domProps(props: Record<string, DomPropValue>): object {
    return props;
}
