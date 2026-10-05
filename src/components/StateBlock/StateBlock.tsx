import type { ReactNode } from '@maninthecoat/react';
import emptyPlanetUrl from '@assets/empty-planet.svg';
import './StateBlock.css';

/** Свойства {@link StateBlock}. */
interface StateBlockProps {
    title: string;
    description: string;
    /** Кнопки под описанием */
    children?: ReactNode;
}

/**
 * Заглушка пустого состояния (Components → StateBlock).
 * @param {StateBlockProps} props свойства заглушки
 * @returns {JSX.Element} заглушка
 */
export function StateBlock({ title, description, children }: StateBlockProps) {
    return (
        <div className="state-block">
            <img key="icon" src={emptyPlanetUrl} alt="" width={56} height={56} />
            <h2 key="title" className="state-block__title">
                {title}
            </h2>
            <p key="description" className="state-block__description">
                {description}
            </p>
            {children && (
                <div key="actions" className="state-block__actions">
                    {children}
                </div>
            )}
        </div>
    );
}
