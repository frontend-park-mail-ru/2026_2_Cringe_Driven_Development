import type { ReactNode } from '@maninthecoat/react';
import { clsx } from '@modules/clsx';
import { Icon } from '@components/Icon/Icon';
import type { IconName } from '@components/Icon/icons';
import './Button.css';

/**
 * Варианты кнопки из макета (Components → Button, Type).
 * Primary — главное действие экрана, Secondary — остальные, Danger — выход и удаление,
 * Inverse — кнопка на светлой «луне».
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'inverse';

/** Свойства {@link Button}. */
interface ButtonProps {
    id?: string;
    /** Текст кнопки */
    children: ReactNode;
    /** Вид кнопки (по умолчанию primary) */
    variant?: ButtonVariant;
    /** Тип нативной кнопки (по умолчанию button) */
    type?: 'button' | 'submit';
    /** Состояние Loading: спиннер перед текстом, повторные нажатия игнорируются */
    loading?: boolean;
    /** Растянуть на ширину родителя */
    block?: boolean;
    /** Иконка перед текстом (свойство Icon в макете) */
    icon?: IconName;
    /** Нажатие; во время загрузки не вызывается */
    onClick?: (event: MouseEvent) => void;
}

/**
 * Классы кнопки: нужны и ссылке, которая выглядит как кнопка.
 * @param variant вид кнопки
 * @param block растянуть на ширину родителя
 * @returns строка классов
 */
export function buttonClassName(variant: ButtonVariant, block = false): string {
    return clsx('button', `button--${variant}`, { 'button--block': block });
}

/**
 * Кнопка высотой 44 px (размер M из макета).
 * @param props свойства кнопки
 * @returns элемент button
 */
export function Button({
    id,
    children,
    variant = 'primary',
    type = 'button',
    loading = false,
    block = false,
    icon,
    onClick,
}: ButtonProps) {
    const className = clsx(buttonClassName(variant, block), { 'button--loading': loading });

    return (
        <button
            id={id}
            className={className}
            type={type}
            aria-busy={loading ? 'true' : undefined}
            aria-disabled={loading ? 'true' : undefined}
            onClick={(event) => {
                // В макете кнопка в загрузке выглядит активной, но повторно срабатывать не должна
                if (loading) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            }}
        >
            {loading && <Icon key="spinner" name="spinner" className="button__spinner" />}
            {icon && !loading && <Icon key="icon" name={icon} size={14} />}
            <span key="label">{children}</span>
        </button>
    );
}
