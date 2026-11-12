/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { ORBIT_STARS, PLANET_SIZE, PLANET_TOP, orbitStarCount } from './orbit';

const DENSITY = 70 / (1440 * 880);

/**
 * Радиус, до которого рендерятся звёзды.
 * @param width ширина фона, px
 * @param planetTop верх планеты, px
 * @returns расстояние до центра планеты самой дальней звезды, px
 */
function renderedRadius(width: number, planetTop: number) {
    return ORBIT_STARS[orbitStarCount(width, planetTop) - 1]!.r;
}

describe('orbit', () => {
    test('пул лежит вне диска планеты, по возрастанию расстояния', () => {
        expect(ORBIT_STARS.every(({ r }) => r >= PLANET_SIZE / 2)).toBe(true);
        expect(ORBIT_STARS.every((star, i) => i === 0 || ORBIT_STARS[i - 1]!.r <= star.r)).toBe(
            true,
        );
    });

    test('поле достаёт до дальнего угла фона при любом угле поворота', () => {
        for (const width of [390, 1440, 2560]) {
            for (const planetTop of [PLANET_TOP.home, PLANET_TOP.auth]) {
                const corner = Math.hypot(width / 2, planetTop + PLANET_SIZE / 2);
                expect(renderedRadius(width, planetTop)).toBeGreaterThan(corner - 10);
                expect(orbitStarCount(width, planetTop)).toBeLessThan(ORBIT_STARS.length);
            }
        }
    });

    test('у внешнего края поля нет разреженной полосы', () => {
        const radius = renderedRadius(1440, PLANET_TOP.auth);
        const band = ORBIT_STARS.filter(({ r }) => r > radius - 300 && r <= radius).length;
        const expected = DENSITY * Math.PI * (radius ** 2 - (radius - 300) ** 2);
        expect(band).toBeGreaterThan(expected * 0.8);
        expect(band).toBeLessThan(expected * 1.2);
    });

    test('число звёзд растёт с шириной и ограничено пулом', () => {
        expect(orbitStarCount(390, PLANET_TOP.home)).toBeLessThan(
            orbitStarCount(1440, PLANET_TOP.home),
        );
        expect(orbitStarCount(100_000, PLANET_TOP.auth)).toBe(ORBIT_STARS.length);
    });
});
