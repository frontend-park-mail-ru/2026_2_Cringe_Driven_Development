/** Минимальный диаметр планеты, px. */
const MIN_PLANET_SIZE = 2600;

/** Высота макета статичного поля, px: в ней лежали звёзды. */
const FIELD_HEIGHT = 880;
/** Звёзд в статичном поле: их x задавался в процентах ширины, поэтому на узком экране плотнее. */
const FIELD_STARS = 70;
/** Ширина, на которой плотность максимальна; уже — как на ней. */
const MIN_WIDTH = 320;
/** Глубина под верхом планеты, px: ниже диск закрывает фон целиком, звёзды там не нужны. */
const DISC_COVER = 400;
/** Потолок числа звёзд: на очень длинных страницах кольцо огромно, а каждая звезда — узел DOM. */
const MAX_STARS = 1500;

/** Звезда вращаемого поля: координаты в px от центра планеты. */
interface OrbitStar {
    /** Номер звезды: ключ и сдвиг мерцания. */
    id: number;
    /** Смещение по x от центра планеты, px. */
    x: number;
    /** Смещение по y от центра планеты, px. */
    y: number;
    /** Диаметр, px. */
    size: number;
    /** Непрозрачность. */
    opacity: number;
}

/**
 * Диаметр планеты для фона заданной ширины: планета всегда шире кадра вдвое, поэтому виден только
 * её пологий верхний сегмент.
 * @param width ширина фона, px
 * @returns диаметр, px
 */
export function planetSize(width: number): number {
    return Math.max(MIN_PLANET_SIZE, 2 * width);
}

/**
 * Звёзды, которые закрывают фон при любом угле поворота: кольцо от края планеты до самого дальнего
 * угла видимой части фона. Плотность — как у прежнего поля, 70 звёзд на ширину. Звёзды — пуассоновский
 * процесс по площади с постоянным seed: идут по возрастанию расстояния до центра, поэтому смена
 * внешнего радиуса (высоты контента) только добавляет или убирает звёзды на краю.
 * @param width ширина фона, px
 * @param height высота фона, px
 * @param planetTop верх планеты от верха фона, px
 * @returns звёзды для рендера
 */
export function orbitStars(width: number, height: number, planetTop: number): OrbitStar[] {
    const inner = planetSize(width) / 2;
    const centerY = planetTop + inner;
    const bottom = Math.min(height, planetTop + DISC_COVER);
    const outer = Math.hypot(width / 2, Math.max(centerY, Math.abs(bottom - centerY))) + 3;
    const density = FIELD_STARS / (Math.max(width, MIN_WIDTH) * FIELD_HEIGHT);
    let seed = 7;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const stars: OrbitStar[] = [];
    let area = 0;
    for (;;) {
        area += -Math.log(1 - random()) / density;
        const r = Math.sqrt(inner ** 2 + area / Math.PI);
        if (r > outer || stars.length >= MAX_STARS) return stars;
        const angle = random() * 2 * Math.PI;
        stars.push({
            id: stars.length,
            x: Math.round(r * Math.cos(angle)),
            y: Math.round(r * Math.sin(angle)),
            size: random() < 0.85 ? 1.5 : 2.5,
            opacity: 0.25 + random() * 0.6,
        });
    }
}
