import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from '@cdd-team/react';
import { orbitStars, planetSize } from './orbit';
import styles from './Space.module.css';

/** Ширина макета, px: координата x звезды переводится в проценты от неё. */
const WIDTH = 1440;
const STAR_COUNT = 70;
/** Насколько верх дуги выше верхнего края якоря, когда горизонт привязан к его верху, px. */
const ARC_GAP = 24;

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
     * Элемент, к которому привязан горизонт. Без него планеты нет: вариант plain редактора
     */
    anchor?: RefObject<HTMLElement | null>;
    /**
     * above — верх дуги на {@link ARC_GAP} px выше верхнего края якоря (список блокнотов);
     * below — верх дуги сразу под нижним краем якоря (карточка, форма)
     */
    edge?: 'above' | 'below';
}

/** Положение планеты в фоне, px. */
interface Geometry {
    width: number;
    height: number;
    top: number;
}

/** Фон «Космос». Декоративный. */
export function Space({ anchor, edge = 'below' }: SpaceProps) {
    const root = useRef<HTMLDivElement | null>(null);
    const [geometry, setGeometry] = useState<Geometry | null>(null);
    const orbit = useMemo(
        () => (geometry ? orbitStars(geometry.width, geometry.height, geometry.top) : []),
        [geometry],
    );

    useLayoutEffect(() => {
        const element = root.current;
        const target = anchor?.current;
        if (!element || !target) return;
        const update = () => {
            const base = element.getBoundingClientRect();
            const box = target.getBoundingClientRect();
            const next = {
                width: element.clientWidth,
                height: element.clientHeight,
                top: Math.max(
                    0,
                    Math.round(
                        edge === 'above' ? box.top - base.top - ARC_GAP : box.bottom - base.top,
                    ),
                ),
            };
            setGeometry((prev) =>
                prev &&
                prev.width === next.width &&
                prev.height === next.height &&
                prev.top === next.top
                    ? prev
                    : next,
            );
        };
        update();
        // верх якоря сдвигают и соседи выше него: следим за всеми предками до родителя фона
        const observer = new ResizeObserver(update);
        observer.observe(element);
        for (let node: HTMLElement | null = target; node; node = node.parentElement) {
            observer.observe(node);
            if (node === element.parentElement) break;
        }
        void document.fonts?.ready.then(update);
        return () => observer.disconnect();
    }, [anchor, edge]);

    const diameter = geometry ? planetSize(geometry.width) : 0;

    return (
        <div
            ref={root}
            className={styles.space}
            style={{ '--planet-top': `${geometry?.top ?? 0}px`, '--planet-size': `${diameter}px` }}
            aria-hidden="true"
        >
            <div key="glow" className={styles.glow} />
            {!anchor ? (
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
                    {orbit.map(({ id, x, y, size, opacity }) => (
                        <span
                            key={`star-${id}`}
                            className={styles.star}
                            style={{
                                left: `${x}px`,
                                top: `${y}px`,
                                '--size': `${size}px`,
                                '--opacity': String(opacity),
                                ...twinkle(id),
                            }}
                        />
                    ))}
                </div>
            )}
            {anchor && geometry && (
                <div key="planet" className={styles.planet}>
                    <div key="halo" className={styles.halo} />
                    <div key="aura" className={styles.aura} />
                    <div key="limb" className={styles.limb} />
                    <div key="surface" className={styles.surface}>
                        <div key="cover" className={styles.cover}>
                            <div key="clouds" className={styles.clouds} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
