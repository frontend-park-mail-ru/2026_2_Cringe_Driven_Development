// В JSX-типах @cdd-team/react нет <mark> и <search> (поиск по блокноту) и <iframe> (встраивание /embed/*)
import type { BaseHTMLAttributes } from '@cdd-team/react';

declare module '@cdd-team/react/jsx-runtime' {
    namespace JSX {
        interface IntrinsicElements {
            mark: BaseHTMLAttributes<HTMLElement>;
            search: BaseHTMLAttributes<HTMLElement>;
            iframe: BaseHTMLAttributes<HTMLIFrameElement> & {
                src?: string;
                title?: string;
                loading?: 'lazy' | 'eager';
            };
        }
    }
}
