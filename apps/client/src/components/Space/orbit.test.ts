/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { PLANET_SIZE, PLANET_TOP, orbitStars } from './orbit';

const PHASES = 12;

/**
 * Звёзды в видимой области над диском планеты при повороте на долю оборота.
 * @param width ширина фона, px
 * @param height высота окна, px
 * @param planetTop верх планеты, px
 * @param phase доля оборота, 0–1
 * @returns число звёзд
 */
function visible(width: number, height: number, planetTop: number, phase: number) {
    const angle = phase * 2 * Math.PI;
    const centerY = planetTop + PLANET_SIZE / 2;
    return orbitStars(width, planetTop).filter(({ x, y }) => {
        const left = width / 2 + x * Math.cos(angle) - y * Math.sin(angle);
        const top = centerY + x * Math.sin(angle) + y * Math.cos(angle);
        return left >= 0 && left <= width && top >= 0 && top <= height;
    }).length;
}

/**
 * Сколько звёзд было бы видно у прежнего статичного поля: 70 звёзд на `width × 880` px,
 * площадь области над диском считается сеткой.
 * @param width ширина фона, px
 * @param height высота окна, px
 * @param planetTop верх планеты, px
 * @returns ожидаемое число звёзд
 */
function expected(width: number, height: number, planetTop: number) {
    const centerY = planetTop + PLANET_SIZE / 2;
    let cells = 0;
    const rows = Math.min(height, 880);
    for (let x = 0.5; x < width; x++) {
        for (let y = 0.5; y < rows; y++) {
            if (Math.hypot(x - width / 2, y - centerY) > PLANET_SIZE / 2) cells++;
        }
    }
    return (70 / (width * 880)) * cells;
}

describe('orbitStars', () => {
    for (const [width, height] of [
        [390, 844],
        [1440, 900],
    ] as const) {
        for (const [name, planetTop] of Object.entries(PLANET_TOP)) {
            test(`${name} ${width}×${height}: плотность как у прежнего поля в любой фазе`, () => {
                const want = expected(width, height, planetTop);
                for (let step = 0; step < PHASES; step++) {
                    const got = visible(width, height, planetTop, step / PHASES);
                    expect(got).toBeGreaterThan(want * 0.5);
                    expect(got).toBeLessThan(want * 1.6);
                }
            });
        }
    }

    test('узкий фон плотнее широкого, дальний угол достижим', () => {
        expect(orbitStars(390, PLANET_TOP.auth).length).toBeGreaterThan(
            orbitStars(1440, PLANET_TOP.auth).length,
        );
        const corner = Math.hypot(195, PLANET_TOP.home + PLANET_SIZE / 2);
        const farthest = Math.max(...orbitStars(390, PLANET_TOP.home).map(({ r }) => r));
        expect(farthest).toBeGreaterThan(corner - 20);
        expect(farthest).toBeLessThanOrEqual(corner + 3);
    });
});
