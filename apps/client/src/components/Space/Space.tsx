import { useLayoutEffect, useRef, useState } from '@cdd-team/react';
import { ORBIT_STARS, PLANET_SIZE, PLANET_TOP, orbitStarCount } from './orbit';
import styles from './Space.module.css';

/** Ширина макета, px: координата x звезды переводится в проценты от неё. */
const WIDTH = 1440;
const STAR_COUNT = 70;

/**
 * Звёзды фона: псевдослучайные с постоянным seed — одинаковые при каждой загрузке.
 * @returns звёзды: x и y в px макета, диаметр, непрозрачность
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

/**
 * Мерцание звезды: свои длительность и фаза.
 * @param index номер звезды
 * @returns CSS-переменные анимации
 */
function twinkle(index: number) {
    return { '--duration': `${3 + (index % 7) * 0.5}s`, '--delay': `${-((index * 0.37) % 3)}s` };
}

/** Свойства {@link Space}. */
interface SpaceProps {
    /**
     * Вариант из макета: auth — планета ниже карточки входа, home — под заголовком главной,
     * plain — без планеты
     */
    variant?: 'auth' | 'home' | 'plain';
}

/** Фон «Космос». Декоративный. */
export function Space({ variant = 'auth' }: SpaceProps) {
    const root = useRef<HTMLDivElement | null>(null);
    const [count, setCount] = useState(0);
    const planetTop = variant === 'plain' ? 0 : PLANET_TOP[variant];

    useLayoutEffect(() => {
        const element = root.current;
        if (!element || !planetTop) return;
        const update = () => setCount(orbitStarCount(element.clientWidth, planetTop));
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [planetTop]);

    return (
        <div
            ref={root}
            className={styles.space}
            style={{ '--planet-top': `${planetTop}px`, '--planet-size': `${PLANET_SIZE}px` }}
            aria-hidden="true"
        >
            <div key="glow" className={styles.glow} />
            {variant === 'plain' ? (
                STARS.map(({ x, y, size, opacity }, index) => (
                    <span
                        key={`star-${index}`}
                        className={styles.star}
                        style={{
                            left: `${(x / WIDTH) * 100}%`,
                            top: `${y}px`,
                            '--size': `${size}px`,
                            '--opacity': String(opacity),
                            ...twinkle(index),
                        }}
                    />
                ))
            ) : (
                <div key="orbit" className={styles.orbit}>
                    {ORBIT_STARS.slice(0, count).map(({ x, y, size, opacity }, index) => (
                        <span
                            key={`star-${index}`}
                            className={styles.star}
                            style={{
                                left: `${x}px`,
                                top: `${y}px`,
                                '--size': `${size}px`,
                                '--opacity': String(opacity),
                                ...twinkle(index),
                            }}
                        />
                    ))}
                </div>
            )}
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
