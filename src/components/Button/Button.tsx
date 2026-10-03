import type { ReactNode } from '@maninthecoat/react';
import { Icon } from '../Icon/Icon';
import './Button.css';

/**
 * Варианты кнопки из макета (Components → Button, Type).
 * Primary — главное действие экрана, Inverse — кнопка на светлой «луне».
 * Secondary и Danger из макета добавим, когда они понадобятся на других экранах.
 */
export type ButtonVariant = 'primary' | 'inverse';

/** Свойства {@link Button}. */
interface ButtonProps {
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
    return ['button', `button--${variant}`, block ? 'button--block' : ''].filter(Boolean).join(' ');
}

/**
 * Кнопка высотой 44 px (размер M из макета).
 * @param props свойства кнопки
 * @returns элемент button
 */
export function Button({
    children,
    variant = 'primary',
    type = 'button',
    loading = false,
    block = false,
    onClick,
}: ButtonProps) {
    const className = buttonClassName(variant, block) + (loading ? ' button--loading' : '');

    return (
        <button
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
            {loading ? <Icon key="spinner" name="spinner" className="button__spinner" /> : null}
            <span key="label">{children}</span>
        </button>
    );
}
