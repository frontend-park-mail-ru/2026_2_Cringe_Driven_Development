import { useMemo, type ReactNode } from '@cdd-team/react';
import { clsx } from '@cdd-team/clsx';
import { parseMarkdown, type MdBlock, type MdInline } from './parse';
import styles from './Markdown.module.css';

/** Свойства {@link Markdown}. */
interface MarkdownProps {
    /** Исходник ячейки: черновик или подтверждённый source */
    source: string;
    className?: string;
}

/**
 * Просмотр Markdown: дерево из {@link parseMarkdown} → только разрешённые элементы, текст —
 * текстовыми узлами. HTML из исходника не создаётся.
 * @param props исходник и класс
 * @returns отформатированный текст
 */
export function Markdown({ source, className }: MarkdownProps) {
    const blocks = useMemo(() => parseMarkdown(source), [source]);
    return <div className={clsx(styles.markdown, className)}>{renderBlocks(blocks)}</div>;
}

// Дерево перестраивается целиком на каждый ввод: ключ — позиция среди соседей
function renderBlocks(blocks: MdBlock[]): ReactNode[] {
    return blocks.map((block, index) => renderBlock(block, `b${index}`));
}

function renderBlock(block: MdBlock, key: string): ReactNode {
    switch (block.type) {
        case 'heading': {
            const children = renderInline(block.children);
            if (block.level === 1)
                return (
                    <h1 key={key} className={styles.h1}>
                        {children}
                    </h1>
                );
            if (block.level === 2)
                return (
                    <h2 key={key} className={styles.h2}>
                        {children}
                    </h2>
                );
            if (block.level === 3)
                return (
                    <h3 key={key} className={styles.minor}>
                        {children}
                    </h3>
                );
            if (block.level === 4)
                return (
                    <h4 key={key} className={styles.minor}>
                        {children}
                    </h4>
                );
            if (block.level === 5)
                return (
                    <h5 key={key} className={styles.minor}>
                        {children}
                    </h5>
                );
            return (
                <h6 key={key} className={styles.minor}>
                    {children}
                </h6>
            );
        }
        case 'paragraph':
            return <p key={key}>{renderInline(block.children)}</p>;
        case 'list': {
            const items = block.items.map((item, index) => (
                <li key={`i${index}`}>{renderBlocks(item)}</li>
            ));
            return block.ordered ? (
                <ol key={key} start={block.start}>
                    {items}
                </ol>
            ) : (
                <ul key={key}>{items}</ul>
            );
        }
        case 'quote':
            return (
                <blockquote key={key} className={styles.quote}>
                    {renderBlocks(block.children)}
                </blockquote>
            );
        case 'code':
            return (
                <pre key={key} className={styles.code}>
                    <code key="code">{block.text}</code>
                </pre>
            );
    }
}

function renderInline(nodes: MdInline[]): ReactNode[] {
    return nodes.map((node, index) => {
        const key = `n${index}`;
        switch (node.type) {
            case 'text':
                return node.text;
            case 'strong':
                return <strong key={key}>{renderInline(node.children)}</strong>;
            case 'em':
                return <em key={key}>{renderInline(node.children)}</em>;
            case 'code':
                return (
                    <code key={key} className={styles.inlineCode}>
                        {node.text}
                    </code>
                );
            case 'link':
                return node.external ? (
                    <a
                        key={key}
                        className={styles.link}
                        href={node.href}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {renderInline(node.children)}
                    </a>
                ) : (
                    <a key={key} className={styles.link} href={node.href}>
                        {renderInline(node.children)}
                    </a>
                );
        }
    });
}
