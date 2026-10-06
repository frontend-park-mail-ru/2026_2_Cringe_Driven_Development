import { clsx } from '@modules/clsx';
import styles from './Space.module.css';

const WIDTH = 1440;
const STAR_COUNT = 70;

/**
 * Звёзды.
 * @returns {{ x: number; y: number; size: number; opacity: number }[]} звёзды: x и y в px макета,
 *     диаметр, непрозрачность
 */
function makeStars() {
    let seed = 7;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    return Array.from({ length: STAR_COUNT }, () => {
        const size = random() < 0.85 ? 1.5 : 2.5;
        const opacity = 0.25 + random() * 0.6;
        return { x: Math.round(random() * WIDTH), y: Math.round(random() * 880), size, opacity };
    });
}

const STARS = makeStars();

/** Свойства {@link Space}. */
interface SpaceProps {
    /**
     * Вариант из макета: auth — планета ниже карточки входа, home — под заголовком главной,
     * plain — без планеты
     */
    variant?: 'auth' | 'home' | 'plain';
}

/**
 * Фон «Космос». Декоративный.
 * @param {SpaceProps} props свойства фона
 * @returns {JSX.Element} фон
 */
export function Space({ variant = 'auth' }: SpaceProps) {
    return (
        <div className={clsx(styles.space, styles[variant])} aria-hidden="true">
            <div key="glow" className={styles.glow} />
            {STARS.map(({ x, y, size, opacity }, index) => (
                <span
                    key={`star-${index}`}
                    className={styles.star}
                    style={{
                        left: `${(x / WIDTH) * 100}%`,
                        top: `${y}px`,
                        '--size': `${size}px`,
                        '--opacity': String(opacity),
                        '--duration': `${3 + (index % 7) * 0.5}s`,
                        '--delay': `${-((index * 0.37) % 3)}s`,
                    }}
                />
            ))}
            {variant !== 'plain' && (
                <div key="planet" className={styles.planet}>
                    <div key="surface" className={styles.surface}>
                        <div key="clouds" className={styles.clouds} />
                    </div>
                </div>
            )}
        </div>
    );
}
