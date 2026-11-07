import { useLayoutEffect, useRef } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import styles from './Output.module.css';

/** Вывод ячейки в формате nbformat: недоверенные данные. */
export type NbOutput = Record<string, unknown>;

/** Выбранное представление вывода: что и как показать. */
export type Shown =
    | { kind: 'text'; text: string; stream?: 'stderr' }
    | { kind: 'error'; text: string }
    | { kind: 'image'; src: string }
    | { kind: 'html'; html: string }
    | { kind: 'unsupported'; mimes: string[] };

// nbformat хранит многострочный текст строкой или массивом строк
const joined = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every((part) => typeof part === 'string')) {
        return value.join('');
    }
    return undefined;
};

// Цвета IPython в traceback — управляющие последовательности ANSI, текстом они не нужны
// oxlint-disable-next-line no-control-regex
const stripAnsi = (text: string): string => text.replace(/\u001b\[[\d;]*m/g, '');

/**
 * Одно представление вывода: PNG → SVG → HTML → текст. SVG — только как картинка, HTML — только в
 * изолированном iframe, JavaScript не исполняется.
 * @param output вывод nbformat
 * @returns что показать
 */
export function pickOutput(output: NbOutput): Shown {
    switch (output.output_type) {
        case 'stream':
            return {
                kind: 'text',
                text: joined(output.text) ?? '',
                stream: output.name === 'stderr' ? 'stderr' : undefined,
            };
        case 'error': {
            const traceback = joined(
                Array.isArray(output.traceback) ? output.traceback.map((l) => `${l}\n`) : undefined,
            );
            const title = `${String(output.ename ?? 'Error')}: ${String(output.evalue ?? '')}`;
            return { kind: 'error', text: stripAnsi(traceback?.trimEnd() || title) };
        }
    }
    const data = (output.data ?? {}) as Record<string, unknown>;
    const png = joined(data['image/png']);
    if (png) return { kind: 'image', src: `data:image/png;base64,${png.replace(/\s/g, '')}` };
    const svg = joined(data['image/svg+xml']);
    if (svg)
        return {
            kind: 'image',
            src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        };
    const html = joined(data['text/html']);
    if (html) return { kind: 'html', html };
    const plain = joined(data['text/plain']);
    if (plain !== undefined) return { kind: 'text', text: plain };
    return { kind: 'unsupported', mimes: Object.keys(data) };
}

/** Свойства {@link Outputs}. */
interface OutputsProps {
    outputs: NbOutput[];
    truncated: boolean;
}

/**
 * Выводы кодовой ячейки по порядку. Текст и traceback — текстовыми узлами, разметка в них не
 * разбирается.
 * @param props выводы и признак усечения
 * @returns выводы или ничего
 */
export function Outputs({ outputs, truncated }: OutputsProps) {
    if (outputs.length === 0 && !truncated) return null;
    return (
        <div className={styles.outputs}>
            {outputs.map((output, index) => (
                <OutputView key={`output-${index}`} shown={pickOutput(output)} />
            ))}
            {truncated && (
                <p key="truncated" className={styles.note}>
                    Вывод сокращён
                </p>
            )}
        </div>
    );
}

function OutputView({ shown }: { shown: Shown }) {
    switch (shown.kind) {
        case 'text':
            return (
                <pre className={shown.stream === 'stderr' ? styles.stderr : styles.text}>
                    {shown.text}
                </pre>
            );
        case 'error':
            return (
                <div className={styles.error}>
                    <p key="title" className={styles.errorTitle}>
                        <Icon key="icon" name="alert" />
                        Ошибка выполнения
                    </p>
                    <pre key="traceback" className={styles.traceback}>
                        {shown.text}
                    </pre>
                </div>
            );
        case 'image':
            return <img className={styles.image} src={shown.src} alt="Изображение из вывода" />;
        case 'html':
            return <HtmlFrame html={shown.html} />;
        case 'unsupported':
            return (
                <p className={styles.unsupported}>
                    <Icon key="icon" name="alert" />
                    Формат вывода не поддерживается
                    {shown.mimes.length > 0 && (
                        <code key="mime" className={styles.mime}>
                            {shown.mimes.join(', ')}
                        </code>
                    )}
                </p>
            );
    }
}

// HTML — в iframe с пустым sandbox: без скриптов, форм и доступа к origin приложения. iframe
// создаётся вручную: sandbox ставится раньше srcdoc, а в JSX-типах @cdd-team/react тега нет
function HtmlFrame({ html }: { html: string }) {
    const host = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', '');
        frame.title = 'HTML-вывод ячейки';
        frame.className = styles.html!;
        frame.srcdoc = html;
        host.current?.replaceChildren(frame);
        return () => frame.remove();
    }, [html]);
    return <div ref={host} />;
}
