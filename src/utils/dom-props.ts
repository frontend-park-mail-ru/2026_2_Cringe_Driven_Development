/**
 * Атрибуты, которых нет в JSX-типах @maninthecoat/react (autocomplete, autocapitalize, spellcheck…).
 *
 * Рантайм библиотеки умеет их ставить: имя, которое есть у DOM-узла, записывается свойством,
 * остальное — через setAttribute. Не хватает только типов. Аугментация JSX.IntrinsicElements умеет
 * добавлять новые теги, но не новые атрибуты существующим: свойство `input` уже объявлено, а повторное
 * объявление обязано иметь тот же тип. Поэтому атрибуты передаются через spread значения типа `object`.
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
 * @param props атрибуты и их значения
 * @returns объект для spread в JSX-элемент
 */
export function domProps(props: Record<string, DomPropValue>): object {
    return props;
}
