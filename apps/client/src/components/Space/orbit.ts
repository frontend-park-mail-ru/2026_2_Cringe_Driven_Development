/** Диаметр планеты, px. */
export const PLANET_SIZE = 2600;

/** Верх планеты в фоне по вариантам, px. */
export const PLANET_TOP = { auth: 700, home: 330 } as const;

/** Видимая плотность звёзд, как у статичного поля: 70 звёзд на 1440×880 px. */
const DENSITY = 70 / (1440 * 880);
/** Внешний радиус пула, px: с центром на 2000 px покрывает фон шириной до ~6900 px. */
const POOL_RADIUS = 4000;

/** Звезда вращаемого поля: координаты в px от центра планеты. */
export interface OrbitStar {
    /** Смещение по x от центра планеты, px. */
    x: number;
    /** Смещение по y от центра планеты, px. */
    y: number;
    /** Расстояние до центра планеты, px. */
    r: number;
    /** Диаметр, px. */
    size: number;
    /** Непрозрачность. */
    opacity: number;
}

/**
 * Пул звёзд в кольце от края планеты до {@link POOL_RADIUS}: равномерно по площади, с постоянным
 * seed. Внутри диска звёзды не нужны — их закрывает планета.
 * @returns звёзды по возрастанию расстояния до центра
 */
function makeOrbitStars(): OrbitStar[] {
    let seed = 7;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const inner = PLANET_SIZE / 2;
    const count = Math.round(DENSITY * Math.PI * (POOL_RADIUS ** 2 - inner ** 2));
    return Array.from({ length: count }, () => {
        const r = Math.sqrt(inner ** 2 + random() * (POOL_RADIUS ** 2 - inner ** 2));
        const angle = random() * 2 * Math.PI;
        const size = random() < 0.85 ? 1.5 : 2.5;
        const opacity = 0.25 + random() * 0.6;
        return {
            x: Math.round(r * Math.cos(angle)),
            y: Math.round(r * Math.sin(angle)),
            r,
            size,
            opacity,
        };
    }).toSorted((a, b) => a.r - b.r);
}

/** Пул звёзд вращаемого поля, по возрастанию расстояния до центра. */
export const ORBIT_STARS = makeOrbitStars();

/**
 * Сколько звёзд из начала {@link ORBIT_STARS} нужно, чтобы при любом угле поворота закрыть фон:
 * дальше всех от центра планеты верхние углы фона.
 * @param width ширина фона, px
 * @param planetTop верх планеты, px
 * @returns число звёзд
 */
export function orbitStarCount(width: number, planetTop: number): number {
    const radius = Math.hypot(width / 2, planetTop + PLANET_SIZE / 2) + 3;
    const index = ORBIT_STARS.findIndex((star) => star.r > radius);
    return index === -1 ? ORBIT_STARS.length : index;
}
