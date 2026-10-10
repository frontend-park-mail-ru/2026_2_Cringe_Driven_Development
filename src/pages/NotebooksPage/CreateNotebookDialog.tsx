import { useEffect, useState } from '@maninthecoat/react';

import { api } from '@api/client';
import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { Modal } from '@components/Modal/Modal';
import { useNavigate } from '@modules/router';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import styles from './NotebooksPage.module.css';

const FIELD_ID = 'notebook-name';

/** Ограничение из Apidog */
const NAME_MAX = 128;

type CreateResult = { ok: true; id: number } | { ok: false; invalid: boolean };

/**
 * Проверяет название блокнота.
 * @param {string} name название
 * @returns {string | undefined} текст ошибки или undefined, если название подходит
 */
function validateName(name: string): string | undefined {
    const trimmed = name.trim();
    if (trimmed === '') return 'Введите название';
    if (trimmed.length > NAME_MAX) return `Не больше ${NAME_MAX} символов`;
    return undefined;
}

/**
 * Создаёт блокнот.
 * @param {string} name название без пробелов по краям
 * @returns {Promise<CreateResult>} id нового блокнота или признак, что бэкенд не принял название
 */
async function createNotebook(name: string): Promise<CreateResult> {
    try {
        const { data, error } = await api.POST('/notebooks', { body: { name } });
        if (data) return { ok: true, id: data.id };
        return { ok: false, invalid: error?.code === 'validation_error' };
    } catch {
        return { ok: false, invalid: false };
    }
}

/** Свойства {@link CreateNotebookDialog}. */
interface CreateNotebookDialogProps {
    onClose: () => void;
}

/**
 * Модалка «Новый блокнот». Созданный блокнот сразу открывается.
 * @param {CreateNotebookDialogProps} props свойства модалки
 * @returns {JSX.Element} модалка
 */
export function CreateNotebookDialog({ onClose }: CreateNotebookDialogProps) {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [pending, setPending] = useState(false);
    const [serverError, setServerError] = useState<string | undefined>(undefined);
    const [life] = useState({ alive: true });
    const [snackbarId, setSnackbarId] = useState(0);

    useEffect(() => {
        if (!pending) document.getElementById(FIELD_ID)?.focus();
    }, [pending]);

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    useEffect(() => () => hideSnackbar(snackbarId), [snackbarId]);

    const error = serverError ?? (submitted ? validateName(name) : undefined);

    const close = () => {
        if (!pending) onClose();
    };

    const send = async () => {
        setPending(true);
        setServerError(undefined);
        hideSnackbar(snackbarId);

        const result = await createNotebook(name.trim());
        if (!life.alive) return;
        if (result.ok) {
            navigate({ to: '/notebooks/$notebookId', params: { notebookId: result.id } });
            return;
        }

        setPending(false);
        if (result.invalid) {
            setServerError('Проверьте название');
            return;
        }
        setSnackbarId(
            showSnackbar('Не удалось создать блокнот', {
                label: 'Повторить',
                onClick: () => void send(),
            }),
        );
    };

    const handleSubmit = (event: Event) => {
        event.preventDefault();
        if (pending) return;

        setSubmitted(true);
        if (validateName(name)) {
            document.getElementById(FIELD_ID)?.focus();
            return;
        }
        void send();
    };

    return (
        <Modal title="Новый блокнот" initialFocusId={FIELD_ID} onClose={close}>
            <form className={styles.createForm} noValidate onSubmit={handleSubmit}>
                <Input
                    key="name"
                    id={FIELD_ID}
                    label="Название"
                    name="name"
                    value={name}
                    placeholder="Например, Лабораторная 4"
                    error={error}
                    disabled={pending}
                    autocomplete="off"
                    onValueChange={(value) => {
                        setName(value);
                        setServerError(undefined);
                        hideSnackbar(snackbarId);
                    }}
                />
                <div key="actions" className={styles.createActions}>
                    <Button key="cancel" variant="secondary" onClick={close}>
                        Отмена
                    </Button>
                    <Button key="submit" type="submit" loading={pending}>
                        {pending ? 'Создаём…' : 'Создать'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
