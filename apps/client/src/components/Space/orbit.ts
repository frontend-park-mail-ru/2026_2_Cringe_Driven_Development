/** Диаметр планеты, px. */
export const PLANET_SIZE = 2600;

/** Верх планеты в фоне по вариантам, px. */
export const PLANET_TOP = { auth: 700, home: 330 } as const;

/** Высота макета статичного поля, px: в ней лежали звёзды. */
const FIELD_HEIGHT = 880;
/** Звёзд в статичном поле: их x задавался в процентах ширины, поэтому на узком экране плотнее. */
const FIELD_STARS = 70;
/** Ширина, на которой плотность максимальна; уже — как на ней. */
const MIN_WIDTH = 320;
/** Внешний радиус пула, px: с центром на 2000 px покрывает фон шириной до ~6900 px. */
const POOL_RADIUS = 4000;

/** Звезда вращаемого поля: координаты в px от центра планеты. */
interface OrbitStar {
    /** Номер в пуле: ключ и сдвиг мерцания. */
    id: number;
    /** Смещение по x от центра планеты, px. */
    x: number;
    /** Смещение по y от центра планеты, px. */
    y: number;
    /** Расстояние до центра планеты, px. */
    r: number;
    /** Порог прореживания: звезда рисуется, если он меньше доли плотности текущей ширины. */
    u: number;
    /** Диаметр, px. */
    size: number;
    /** Непрозрачность. */
    opacity: number;
}

/**
 * Пул звёзд в кольце от края планеты до {@link POOL_RADIUS}: равномерно по площади, с постоянным
 * seed, с плотностью самого узкого фона. Внутри диска звёзды не нужны — их закрывает планета.
 * @returns звёзды по возрастанию расстояния до центра
 */
function makeOrbitStars(): OrbitStar[] {
    let seed = 7;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const inner = PLANET_SIZE / 2;
    const density = FIELD_STARS / (MIN_WIDTH * FIELD_HEIGHT);
    const count = Math.round(density * Math.PI * (POOL_RADIUS ** 2 - inner ** 2));
    return Array.from({ length: count }, () => {
        const r = Math.sqrt(inner ** 2 + random() * (POOL_RADIUS ** 2 - inner ** 2));
        const angle = random() * 2 * Math.PI;
        const u = random();
        const size = random() < 0.85 ? 1.5 : 2.5;
        const opacity = 0.25 + random() * 0.6;
        return {
            x: Math.round(r * Math.cos(angle)),
            y: Math.round(r * Math.sin(angle)),
            r,
            u,
            size,
            opacity,
        };
    })
        .toSorted((a, b) => a.r - b.r)
        .map((star, id) => ({ ...star, id }));
}

/** Пул звёзд вращаемого поля, по возрастанию расстояния до центра. */
const ORBIT_STARS = makeOrbitStars();

/**
 * Звёзды, которые нужны фону заданной ширины, чтобы при любом угле поворота закрыть его с плотностью
 * прежнего поля: 70 звёзд на ширину. Дальше всех от центра планеты верхние углы фона; звёзды за ними
 * не нужны. Сужение ширины добавляет звёзд, расширение убирает — по порогу `u`, равномерно.
 * @param width ширина фона, px
 * @param planetTop верх планеты, px
 * @returns звёзды для рендера
 */
export function orbitStars(width: number, planetTop: number): OrbitStar[] {
    const radius = Math.hypot(width / 2, planetTop + PLANET_SIZE / 2) + 3;
    const share = MIN_WIDTH / Math.max(width, MIN_WIDTH);
    return ORBIT_STARS.filter((star) => star.r <= radius && star.u < share);
}
