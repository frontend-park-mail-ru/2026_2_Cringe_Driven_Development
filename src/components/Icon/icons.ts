/**
 * Иконки макета (Components → icon/*). Геометрия перенесена из Figma как есть;
 * eyeSlash («пароль показан») — из прототипа ментора, в Figma её нет.
 *
 * @maninthecoat/react создаёт узлы через document.createElement, а не createElementNS, поэтому
 * inline-SVG в JSX не рисуется. Иконки подключаются как CSS-маска: форма — из SVG, цвет — currentColor.
 * @module components/Icon/icons
 */

const svg = (size: number, body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">${body}</svg>`;

const stroke = (width: number): string =>
    ` stroke="#000" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

const EYE_BODY =
    `<path d="M1.5 9s2.8-4.5 7.5-4.5S16.5 9 16.5 9s-2.8 4.5-7.5 4.5S1.5 9 1.5 9Z"${stroke(1.3)}/>` +
    `<circle cx="9" cy="9" r="2.1"${stroke(1.3)}/>`;

/** Исходники иконок: размер сетки и разметка SVG. */
const SOURCES = {
    eye: svg(18, EYE_BODY),
    // «Пароль показан»: глаз с косой чертой, как в прототипе
    eyeSlash: svg(18, `${EYE_BODY}<path d="m3 15 12-12"${stroke(1.3)}/>`),
    alert: svg(
        16,
        `<circle cx="8" cy="8" r="6.3"${stroke(1.3)}/><path d="M8 4.9v3.6M8 11v.1"${stroke(1.6)}/>`,
    ),
    info: svg(
        16,
        `<circle cx="8" cy="8" r="6.3"${stroke(1.3)}/><path d="M8 7.3v3.8M8 4.9v.1"${stroke(1.6)}/>`,
    ),
    check: svg(16, `<path d="M3.5 8.4l2.9 2.9 6.1-6.3"${stroke(1.6)}/>`),
    cross: svg(16, `<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"${stroke(1.6)}/>`),
    dot: svg(16, '<circle cx="8" cy="8" r="2" fill="#000"/>'),
    spinner: svg(16, `<path d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2"${stroke(1.8)}/>`),
} as const;

/** Имя иконки из макета. */
export type IconName = keyof typeof SOURCES;

/** Готовые значения для CSS mask-image. */
export const ICON_MASKS: Record<IconName, string> = Object.fromEntries(
    Object.entries(SOURCES).map(([name, source]) => [
        name,
        `url("data:image/svg+xml,${encodeURIComponent(source)}")`,
    ]),
) as Record<IconName, string>;
