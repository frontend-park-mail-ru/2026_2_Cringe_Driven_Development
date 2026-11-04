// Типы `*.svg?react` из vite-plugin-svgr/client требуют react, которого в проекте нет
declare module '*.svg?react' {
    import type { FunctionComponent, SVGProps } from '@cdd-team/react';

    const Component: FunctionComponent<SVGProps<SVGSVGElement>>;
    export default Component;
}
