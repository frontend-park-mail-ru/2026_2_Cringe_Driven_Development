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
    /** Подпись таблицы */
    caption: string;
    columns: readonly Column<Row>[];
    rows: readonly Row[];
    /** Уникальный ключ строки */
    rowKey: (row: Row) => string;
}

/** Таблица на нативной разметке. На узком экране прокручивается внутри своей обёртки. */
export function Table<Row>({ caption, columns, rows, rowKey }: TableProps<Row>) {
    return (
        <div className={styles.scroll}>
            <table className={styles.table}>
                <caption key="caption" className={styles.caption}>
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
        </div>
    );
}
