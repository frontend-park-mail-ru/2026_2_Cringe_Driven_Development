import type { ReactNode } from '@maninthecoat/react';
import { navigate } from './router';

/** Свойства {@link Link}. */
interface LinkProps {
    /** Путь внутри приложения */
    to: string;
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
}

/**
 * Ссылка внутри SPA: обычный клик переключает страницу без перезагрузки,
 * клик с модификаторами (новая вкладка и т. п.) остаётся браузеру.
 * @param props свойства ссылки
 * @returns элемент a
 */
export function Link({ to, children, className, 'aria-label': ariaLabel }: LinkProps) {
    return (
        <a
            href={to}
            className={className}
            aria-label={ariaLabel}
            onClick={(event) => {
                if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                ) {
                    return;
                }
                event.preventDefault();
                navigate(to);
            }}
        >
            {children}
        </a>
    );
}
