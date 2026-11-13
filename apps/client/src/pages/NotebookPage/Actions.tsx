import { useEffect, useLayoutEffect, useRef, useState } from '@cdd-team/react';
import { clsx } from '@cdd-team/clsx';
import { isRpcError, trpc } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Icon, type IconName } from '@components/Icon/Icon';
import { IconButton } from '@components/IconButton/IconButton';
import { Input } from '@components/Input/Input';
import { Modal } from '@components/Modal/Modal';
import { renameMeta } from '@stores/notebook';
import { stopRuntime, useRuntimeStore } from '@stores/runtime';
import { showToast } from '@stores/toast';
import styles from './Actions.module.css';

/** Свойства {@link NotebookMenu}. */
interface NotebookMenuProps {
    /** «Завершить окружение»: доступна, недоступна или идёт завершение */
    terminate: 'enabled' | 'disabled' | 'stopping';
    onRename: () => void;
    onTerminate: () => void;
    onDelete: () => void;
}

type Item = {
    key: string;
    icon: IconName;
    label: string;
    disabled?: boolean;
    loading?: boolean;
    danger?: boolean;
    onSelect: () => void;
};

/**
 * `⋯` «Действия с блокнотом» в шапке: переименовать, завершить окружение, удалить. Стрелки
 * переводят фокус по пунктам, Escape закрывает меню и возвращает фокус на кнопку.
 */
export function NotebookMenu({ terminate, onRename, onTerminate, onDelete }: NotebookMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const items: Item[] = [
        { key: 'rename', icon: 'pencil', label: 'Переименовать', onSelect: onRename },
        {
            key: 'terminate',
            icon: 'power',
            label: terminate === 'stopping' ? 'Завершаем окружение…' : 'Завершить окружение',
            disabled: terminate !== 'enabled',
            loading: terminate === 'stopping',
            onSelect: onTerminate,
        },
        {
            key: 'delete',
            icon: 'trash',
            label: 'Удалить блокнот',
            danger: true,
            onSelect: onDelete,
        },
    ];
    const enabled = () =>
        [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
            (item) => !(item as HTMLButtonElement).disabled,
        );
    const close = (refocus: boolean) => {
        setOpen(false);
        if (refocus) ref.current?.querySelector<HTMLElement>('button')?.focus();
    };

    useLayoutEffect(() => {
        if (open) enabled()[0]?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const outside = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) close(false);
        };
        document.addEventListener('mousedown', outside);
        return () => document.removeEventListener('mousedown', outside);
    }, [open]);

    const handleKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
            return;
        }
        if (event.key === 'Tab') return close(false);
        const list = enabled();
        const index = list.indexOf(document.activeElement as HTMLElement);
        const next =
            event.key === 'ArrowDown'
                ? (index + 1) % list.length
                : event.key === 'ArrowUp'
                  ? (index - 1 + list.length) % list.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? list.length - 1
                      : -1;
        if (next < 0) return;
        event.preventDefault();
        list[next]?.focus();
    };

    return (
        <div ref={ref} className={styles.wrap}>
            <IconButton
                key="toggle"
                icon="more"
                label="Действия с блокнотом"
                title="Действия с блокнотом"
                expanded={open}
                onClick={() => setOpen((current) => !current)}
            />
            {open && (
                <div
                    key="menu"
                    className={styles.menu}
                    role="menu"
                    tabIndex={-1}
                    aria-label="Действия с блокнотом"
                    onKeyDown={handleKey}
                >
                    {items.flatMap((item) => [
                        item.key === 'terminate' && (
                            <hr key="separator" className={styles.separator} />
                        ),
                        <button
                            key={item.key}
                            type="button"
                            role="menuitem"
                            className={clsx(styles.item, item.danger && styles.danger)}
                            disabled={item.disabled}
                            aria-busy={item.loading ? 'true' : undefined}
                            onClick={() => {
                                // фокус на ⋯ до открытия диалога: Modal вернёт его сюда при закрытии
                                close(true);
                                item.onSelect();
                            }}
                        >
                            <Icon
                                key="icon"
                                name={item.loading ? 'spinner' : item.icon}
                                className={clsx(item.loading && styles.spin)}
                            />
                            <span key="label">{item.label}</span>
                        </button>,
                    ])}
                </div>
            )}
        </div>
    );
}

const TERMINATE_CANCEL_ID = 'terminate-cancel';

/**
 * Подтверждение «Завершить окружение?»: после подтверждения диалог закрывается, ход завершения
 * видно в шапке и меню.
 */
export function TerminateDialog({ onClose }: { onClose: () => void }) {
    /** Другая команда ждёт ответа: `stopRuntime` её не перебивает — подтвердить пока нельзя */
    const busy = useRuntimeStore().busy !== null;
    return (
        <Modal
            title="Завершить окружение?"
            description="Выполнение остановится, переменные в памяти будут потеряны. Блокнот сохранится."
            initialFocusId={TERMINATE_CANCEL_ID}
            onClose={onClose}
        >
            <div className={styles.actions}>
                <Button key="cancel" id={TERMINATE_CANCEL_ID} variant="secondary" onClick={onClose}>
                    Отмена
                </Button>
                <Button
                    key="submit"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                        onClose();
                        void stopRuntime();
                    }}
                >
                    Завершить окружение
                </Button>
            </div>
        </Modal>
    );
}

const RENAME_FIELD_ID = 'rename-notebook-name';

/** Максимальная длина названия — как при создании блокнота */
const NAME_MAX = 128;

const validateName = (name: string): string | undefined => {
    const trimmed = name.trim();
    if (trimmed === '') return 'Введите название блокнота';
    if ([...trimmed].length > NAME_MAX) return `Не больше ${NAME_MAX} символов`;
    return undefined;
};

/** Свойства {@link RenameDialog}. */
interface RenameDialogProps {
    notebook: { id: number; name: string };
    onClose: () => void;
}

/**
 * «Переименовать блокнот»: пустое название — ошибка поля, во время сохранения диалог не
 * закрывается и не отправляет повторно, при сбое введённое название остаётся.
 */
export function RenameDialog({ notebook, onClose }: RenameDialogProps) {
    const [name, setName] = useState(notebook.name);
    /** Введённое на момент отправки, даже если перерисовка после ввода ещё не прошла */
    const nameRef = useRef(notebook.name);
    const [fieldError, setFieldError] = useState<string | undefined>(undefined);
    const [failed, setFailed] = useState(false);
    const [sending, setSending] = useState(false);
    const sendingRef = useRef(false);
    const close = () => {
        if (!sendingRef.current) onClose();
    };

    const submit = async (event: Event) => {
        event.preventDefault();
        if (sendingRef.current) return;
        const value = nameRef.current;
        const invalid = validateName(value);
        setFieldError(invalid);
        setFailed(false);
        if (invalid) {
            document.getElementById(RENAME_FIELD_ID)?.focus();
            return;
        }
        sendingRef.current = true;
        setSending(true);
        try {
            const renamed = await trpc.notebooks.rename.mutate({
                id: notebook.id,
                name: value.trim(),
            });
            renameMeta(notebook.id, renamed.name);
            showToast('Название сохранено');
            sendingRef.current = false;
            onClose();
            return;
        } catch (error) {
            // BAD_REQUEST — название не прошло проверку BFF (zodError) или Go (validation_error)
            if (isRpcError(error) && error.data?.code === 'BAD_REQUEST') {
                setFieldError('Проверьте название');
            } else setFailed(true);
        }
        sendingRef.current = false;
        setSending(false);
    };

    return (
        <Modal
            title="Переименовать блокнот"
            initialFocusId={RENAME_FIELD_ID}
            locked={sending}
            onClose={close}
        >
            <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
                <Input
                    key="name"
                    id={RENAME_FIELD_ID}
                    label="Название"
                    name="name"
                    value={name}
                    error={fieldError}
                    disabled={sending}
                    autocomplete="off"
                    reserveMessage={false}
                    onValueChange={(value) => {
                        nameRef.current = value;
                        setName(value);
                        setFieldError(undefined);
                    }}
                />
                {failed && (
                    <p key="error" className={styles.error} role="alert">
                        <Icon key="icon" name="alert" className={styles.alert} />
                        <span key="text">Не удалось переименовать блокнот. Попробуйте ещё раз</span>
                    </p>
                )}
                <div key="actions" className={styles.actions}>
                    <Button key="cancel" variant="secondary" disabled={sending} onClick={close}>
                        Отмена
                    </Button>
                    <Button key="submit" type="submit" loading={sending} disabled={sending}>
                        {sending ? 'Сохраняем…' : 'Сохранить'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
