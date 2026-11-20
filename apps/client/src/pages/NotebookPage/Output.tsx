import { clsx } from '@cdd-team/clsx';
import { useLayoutEffect, useRef } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import { htmlDocument } from './htmlDocument';
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

/** Многострочный текст nbformat: строка или массив строк. */
const joined = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every((part) => typeof part === 'string')) {
        return value.join('');
    }
    return undefined;
};

/** Оформление куска текста по ANSI SGR: цвет 0–15 и жирность. */
interface AnsiStyle {
    color?: number;
    bold?: boolean;
    dim?: boolean;
}

/** Кусок текста с одним оформлением. */
export type AnsiPart = AnsiStyle & { text: string };

// Управляющая последовательность CSI: цвет (`m`) применяется, остальное (курсор pip) выкидывается.
// oxlint-disable-next-line no-control-regex
const CSI = /\u001b\[([\d;:?]*)([A-Za-z])/g;

/**
 * Новое оформление после `ESC[…m`. 256 цветов и RGB вне 16 базовых не показываем, текст остаётся.
 * Подпараметры через двоеточие (`38:5:1`, `38:2::r:g:b`) — одна группа, соседние коды не задевают.
 */
function applySgr(style: AnsiStyle, params: string): AnsiStyle {
    const groups = params === '' ? ['0'] : params.split(';');
    const codes = groups.map(Number);
    let next = { ...style };
    for (let i = 0; i < codes.length; i++) {
        if (groups[i]!.includes(':')) {
            const [code, mode, index] = groups[i]!.split(':').map(Number);
            if (code === 38) next.color = mode === 5 && index! < 16 ? index : undefined;
            continue;
        }
        const code = codes[i]!;
        if (code === 0) next = {};
        else if (code === 1) next.bold = true;
        else if (code === 2) next.dim = true;
        else if (code === 22) next = { ...next, bold: undefined, dim: undefined };
        else if (code >= 30 && code <= 37) next.color = code - 30;
        else if (code >= 90 && code <= 97) next.color = code - 90 + 8;
        else if (code === 39) next.color = undefined;
        else if (code === 38 || code === 48) {
            const mode = codes[i + 1];
            if (code === 38)
                next.color = mode === 5 && codes[i + 2]! < 16 ? codes[i + 2] : undefined;
            i += mode === 5 ? 2 : mode === 2 ? 4 : 0;
        }
    }
    return next;
}

/** Текст с ANSI-последовательностями — куски с оформлением, сами последовательности убраны. */
export function parseAnsi(text: string): AnsiPart[] {
    const parts: AnsiPart[] = [];
    let style: AnsiStyle = {};
    let from = 0;
    const push = (to: number) => {
        if (to > from) parts.push({ ...style, text: text.slice(from, to) });
    };
    for (const match of text.matchAll(CSI)) {
        push(match.index);
        from = match.index + match[0].length;
        if (match[2] === 'm') style = applySgr(style, match[1]!);
    }
    push(text.length);
    return parts;
}

/**
 * Одно представление вывода: PNG → SVG → HTML → текст. SVG — только как картинка, HTML — только в
 * изолированном iframe, JavaScript не исполняется.
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
            return { kind: 'error', text: traceback?.trimEnd() || title };
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

/**
 * Представления выводов по порядку. Соседние фрагменты одного потока (stdout или stderr) — один
 * текст: граница сообщений сервера не видна. Через другие выводы текст не склеивается.
 * @returns представления с индексом первого вывода — стабильным ключом
 */
export function groupOutputs(outputs: NbOutput[]): { key: number; shown: Shown }[] {
    const groups: { key: number; shown: Shown }[] = [];
    outputs.forEach((output, index) => {
        const shown = pickOutput(output);
        const last = groups.at(-1)?.shown;
        if (
            output.output_type === 'stream' &&
            outputs[index - 1]?.output_type === 'stream' &&
            last?.kind === 'text' &&
            shown.kind === 'text' &&
            last.stream === shown.stream
        ) {
            last.text += shown.text;
            return;
        }
        groups.push({ key: index, shown });
    });
    return groups;
}

/** Свойства {@link Outputs}. */
interface OutputsProps {
    outputs: NbOutput[];
    /** Сервер сократил вывод */
    truncated: boolean;
}

/**
 * Выводы кодовой ячейки по порядку в общей области. Текст и traceback — текстовыми узлами,
 * разметка в них не разбирается; из ANSI берутся только цвета.
 */
export function Outputs({ outputs, truncated }: OutputsProps) {
    if (outputs.length === 0 && !truncated) return null;
    return (
        <div className={styles.outputs}>
            {groupOutputs(outputs).map(({ key, shown }) => (
                <OutputView key={`output-${key}`} shown={shown} />
            ))}
            {truncated && (
                <p key="truncated" className={styles.note}>
                    Вывод сокращён
                </p>
            )}
        </div>
    );
}

/** Одно представление вывода. */
function OutputView({ shown }: { shown: Shown }) {
    switch (shown.kind) {
        case 'text':
            return (
                <pre className={shown.stream === 'stderr' ? styles.stderr : styles.text}>
                    {ansiNodes(shown.text)}
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
                        {ansiNodes(shown.text)}
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

// Перерисовка строк, как у прогресс-бара pip: `\r` и `ESC[2K` стирают строку, `ESC[1A` — на строку выше.
// oxlint-disable-next-line no-control-regex
const REDRAW = /(\r\n|\n|\r|\u001b\[2K|\u001b\[1A)/;

/** Текст после перерисовок: от каждой строки остаётся последний кадр. */
export function collapseRedraws(text: string): string {
    const lines = [''];
    for (const token of text.split(REDRAW)) {
        if (token === '\n' || token === '\r\n') lines.push('');
        else if (token === '\r' || token === '\u001b[2K') lines[lines.length - 1] = '';
        else if (token === '\u001b[1A') {
            const rest = lines.length > 1 ? lines.pop()! : '';
            lines[lines.length - 1] += rest;
        } else lines[lines.length - 1] += token;
    }
    return lines.join('\n');
}

/** Текст с цветами ANSI: куски без оформления — текстовые узлы, остальные — span с классами. */
const ansiNodes = (text: string) =>
    parseAnsi(collapseRedraws(text)).map((part, index) =>
        part.color === undefined && !part.bold && !part.dim ? (
            part.text
        ) : (
            <span
                key={`ansi-${index}`}
                className={clsx(
                    part.color !== undefined && styles[`ansi${part.color}`],
                    part.bold && styles.bold,
                    part.dim && styles.dim,
                )}
            >
                {part.text}
            </span>
        ),
    );

/**
 * HTML — в iframe с пустым sandbox: без скриптов, форм и доступа к origin приложения. iframe
 * создаётся вручную: sandbox ставится раньше srcdoc, а в JSX-типах `@cdd-team/react` тега нет.
 */
function HtmlFrame({ html }: { html: string }) {
    const host = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', '');
        frame.title = 'HTML-вывод ячейки';
        frame.className = styles.html!;
        frame.srcdoc = htmlDocument(html);
        host.current?.replaceChildren(frame);
        return () => frame.remove();
    }, [html]);
    return <div ref={host} />;
}
