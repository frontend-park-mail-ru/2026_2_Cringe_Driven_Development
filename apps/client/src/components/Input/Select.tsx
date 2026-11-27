import { Field, fieldAria, type FieldProps } from './Field';
import styles from './Input.module.css';

/** Свойства {@link Select}. */
interface SelectProps extends FieldProps {
    /** Варианты выбора */
    options: readonly { value: string; label: string }[];
}

/** Нативный выпадающий список в оформлении {@link Input}. */
export function Select(props: SelectProps) {
    const { id, name, value, options, disabled = false } = props;
    return (
        <Field field={props}>
            <select
                id={id}
                className={styles.field}
                name={name}
                value={value}
                disabled={disabled}
                {...fieldAria(props)}
                onChange={(event) => props.onValueChange((event.target as HTMLSelectElement).value)}
            >
                {options.map((option) => (
                    // selected: библиотека выставляет value до появления option
                    <option
                        key={option.value}
                        value={option.value}
                        selected={option.value === value}
                    >
                        {option.label}
                    </option>
                ))}
            </select>
        </Field>
    );
}
