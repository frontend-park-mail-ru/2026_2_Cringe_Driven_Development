import { useMemo, type ReactNode } from '@cdd-team/react';
import { parseMarkdown, type MdBlock, type MdInline } from './parse';
import styles from './Markdown.module.css';

/** Свойства {@link Markdown}. */
interface MarkdownProps {
    /** Исходник ячейки: черновик или подтверждённый source */
    source: string;
}

/**
 * Просмотр Markdown: дерево из {@link parseMarkdown} → только разрешённые элементы, текст —
 * текстовыми узлами. HTML из исходника не создаётся.
 * @param props исходник
 * @returns отформатированный текст
 */
export function Markdown({ source }: MarkdownProps) {
    const blocks = useMemo(() => parseMarkdown(source), [source]);
    return <div className={styles.markdown}>{renderBlocks(blocks)}</div>;
}

const HEADING_CLASS = {
    1: styles.h1,
    2: styles.h2,
    3: styles.minor,
    4: styles.minor,
    5: styles.minor,
    6: styles.minor,
};

// Дерево перестраивается целиком на каждый ввод: ключ — позиция среди соседей
function renderBlocks(blocks: MdBlock[]): ReactNode[] {
    return blocks.map((block, index) => renderBlock(block, `b${index}`));
}

function renderBlock(block: MdBlock, key: string): ReactNode {
    switch (block.type) {
        case 'heading': {
            // тег — из фиксированного набора h1–h6 по уровню, не из исходника
            const Tag = `h${block.level}` as const;
            return (
                <Tag key={key} className={HEADING_CLASS[block.level]}>
                    {renderInline(block.children)}
                </Tag>
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
