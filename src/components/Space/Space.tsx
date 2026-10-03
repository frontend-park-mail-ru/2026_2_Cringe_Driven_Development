import './Space.css';

const WIDTH = 1440;
const STAR_COUNT = 70;

/**
 * Звёзды.
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
 * Фон «Космос». Декоративный.
 * @returns фон
 */
export function Space() {
    return (
        <div className="space" aria-hidden="true">
            <div key="glow" className="space__glow" />
            {STARS.map(({ x, y, size, opacity }, index) => (
                <span
                    key={`star-${index}`}
                    className="space__star"
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
            <div key="planet" className="space__planet">
                <div key="surface" className="space__surface">
                    <div key="clouds" className="space__clouds" />
                </div>
            </div>
        </div>
    );
}
