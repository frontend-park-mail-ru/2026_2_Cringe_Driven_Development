import type { ReactNode } from '@maninthecoat/react';
import { clsx } from '@modules/clsx';
import { Icon } from '@components/Icon/Icon';
import type { IconName } from '@components/Icon/icons';
import styles from './Button.module.css';

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
    className?: string;
    /** Нажатие; во время загрузки не вызывается */
    onClick?: (event: MouseEvent) => void;
}

/**
 * Классы кнопки: нужны и ссылке, которая выглядит как кнопка.
 * @param {ButtonVariant} variant вид кнопки
 * @param {boolean} [block] растянуть на ширину родителя
 * @returns {string} строка классов
 */
export function buttonClassName(variant: ButtonVariant, block = false): string {
    return clsx(styles.button, styles[variant], block && styles.block);
}

/**
 * Кнопка высотой 44 px (размер M из макета).
 * @param {ButtonProps} props свойства кнопки
 * @returns {JSX.Element} элемент button
 */
export function Button({
    id,
    children,
    variant = 'primary',
    type = 'button',
    loading = false,
    block = false,
    icon,
    className,
    onClick,
}: ButtonProps) {
    return (
        <button
            id={id}
            className={clsx(buttonClassName(variant, block), loading && styles.loading, className)}
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
            {loading && <Icon key="spinner" name="spinner" className={styles.spinner} />}
            {icon && !loading && <Icon key="icon" name={icon} size={14} />}
            <span key="label">{children}</span>
        </button>
    );
}
