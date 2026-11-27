import type { ReactNode } from '@cdd-team/react';
import styles from './Table.module.css';

/** Колонка {@link Table}. */
export interface Column<Row> {
    /** Уникальный ключ колонки */
    key: string;
    /** Заголовок колонки */
    header: string;
    /** Содержимое ячейки строки, в том числе кнопки действий */
    cell: (row: Row) => ReactNode;
}

/** Свойства {@link Table}. */
interface TableProps<Row> {
    /** Префикс id: к подписи привязана область прокрутки */
    id: string;
    /** Подпись таблицы */
    caption: string;
    columns: readonly Column<Row>[];
    rows: readonly Row[];
    /** Уникальный ключ строки */
    rowKey: (row: Row) => string;
}

/**
 * Таблица на нативной разметке. На узком экране прокручивается внутри своей области: браузер
 * сам делает прокручиваемую область доступной с клавиатуры.
 */
export function Table<Row>({ id, caption, columns, rows, rowKey }: TableProps<Row>) {
    const captionId = `${id}-caption`;
    return (
        <section className={styles.scroll} aria-labelledby={captionId}>
            <table className={styles.table}>
                <caption key="caption" id={captionId} className={styles.caption}>
                    {caption}
                </caption>
                <thead key="head">
                    <tr>
                        {columns.map((column) => (
                            <th key={column.key} scope="col">
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody key="body">
                    {rows.map((row) => (
                        <tr key={rowKey(row)}>
                            {columns.map((column) => (
                                <td key={column.key}>{column.cell(row)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
