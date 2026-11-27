import { Field, fieldAria, type FieldProps } from './Field';
import styles from './Input.module.css';

/** Свойства {@link Textarea}. */
interface TextareaProps extends FieldProps {
    /** Подсказка внутри пустого поля */
    placeholder?: string;
    /** Высота в строках до ручного растягивания */
    rows?: number;
}

/** Многострочное поле в оформлении {@link Input}. */
export function Textarea(props: TextareaProps) {
    const { id, name, value, placeholder, rows = 4, disabled = false } = props;
    return (
        <Field field={props} multiline>
            <textarea
                id={id}
                className={styles.field}
                name={name}
                value={value}
                placeholder={placeholder ?? ''}
                rows={rows}
                disabled={disabled}
                {...fieldAria(props)}
                onInput={(event) =>
                    props.onValueChange((event.target as HTMLTextAreaElement).value)
                }
                onBlur={() => props.onBlur?.()}
            />
        </Field>
    );
}
