import { Field, fieldAria, type FieldProps } from './Field';
import styles from './Input.module.css';

/** Свойства {@link Textarea}. */
interface TextareaProps extends FieldProps {
    /** Подсказка внутри пустого поля */
    placeholder?: string;
}

/** Многострочное поле в оформлении {@link Input}: четыре строки, тянется по вертикали. */
export function Textarea(props: TextareaProps) {
    const { id, name, value, placeholder, disabled = false } = props;
    return (
        <Field field={props} multiline>
            <textarea
                id={id}
                className={styles.field}
                name={name}
                value={value}
                placeholder={placeholder ?? ''}
                rows={4}
                disabled={disabled}
                {...fieldAria(props)}
                onInput={(event) =>
                    props.onValueChange((event.target as HTMLTextAreaElement).value)
                }
            />
        </Field>
    );
}
