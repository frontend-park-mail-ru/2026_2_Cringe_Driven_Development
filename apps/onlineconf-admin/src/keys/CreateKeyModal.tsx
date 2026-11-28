import { useRef, useState } from '@cdd-team/react';
import { useNavigate } from '@cdd-team/router';
import { api, isBffError, type JsonInput } from '@api/bff';
import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { Select } from '@components/Input/Select';
import { Textarea } from '@components/Input/Textarea';
import { Modal } from '@components/Modal/Modal';
import { errorText } from './errorText';
import { scopes } from './format';
import { keyNameError } from './name';
import styles from './KeyPage.module.css';

type Scope = JsonInput<'/api/onlineconf/keys/create'>['scope'];

const nameId = 'new-key-name';
const scopeOptions = scopes.map((scope) => ({ value: scope, label: scope }));
const types = [
    { value: 'config', label: 'Конфиг' },
    { value: 'flag', label: 'Флаг' },
];
const formats = [{ value: 'json', label: 'JSON' }];

/** Создание JSON-конфига или флага с переходом к карточке нового ключа. */
export function CreateKeyModal({
    initialScope,
    onClose,
}: {
    initialScope: Scope | '';
    onClose: () => void;
}) {
    const navigate = useNavigate();
    const form = useRef<HTMLFormElement | null>(null);
    const sendingRef = useRef(false);
    const [name, setName] = useState('');
    const [scope, setScope] = useState<Scope>(initialScope || 'frontend');
    const [type, setType] = useState<'config' | 'flag'>('config');
    const [description, setDescription] = useState('');
    const [nameError, setNameError] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    const close = () => {
        if (!sendingRef.current) onClose();
    };

    const submit = async (event: Event) => {
        event.preventDefault();
        if (sendingRef.current || nameError) return;
        // Enter сразу после ввода отправляет форму раньше перерисовки: имя берётся из поля
        const field = form.current?.elements.namedItem('name');
        const trimmed = field instanceof HTMLInputElement ? field.value.trim() : '';
        const invalid = keyNameError(trimmed, scope);
        setError(undefined);
        if (invalid) {
            setNameError(invalid);
            document.getElementById(nameId)?.focus();
            return;
        }

        sendingRef.current = true;
        setLoading(true);
        try {
            const created = await api('POST', '/api/onlineconf/keys/create', {
                contentType: 'application/json',
                body:
                    type === 'config'
                        ? { name: trimmed, scope, type, format: 'json', description }
                        : { name: trimmed, scope, type, description },
            });
            if (form.current?.isConnected) {
                onClose();
                void navigate({ to: '/keys/$name', params: { name: created.name } });
            }
        } catch (cause) {
            if (!form.current?.isConnected) return;
            if (isBffError(cause) && cause.appCode === 'key_name_taken') {
                setNameError('Ключ уже существует');
            } else {
                setError(errorText(cause, 'Не удалось создать ключ. Попробуйте ещё раз.'));
            }
        } finally {
            sendingRef.current = false;
            if (form.current?.isConnected) setLoading(false);
        }
    };

    return (
        <Modal title="Новый ключ" initialFocusId={nameId} locked={loading} onClose={close}>
            <form
                ref={form}
                className={styles.fields}
                noValidate
                onSubmit={(event) => void submit(event)}
            >
                <Input
                    key="name"
                    id={nameId}
                    label="Название"
                    name="name"
                    value={name}
                    placeholder={scope + '.имя'}
                    hint="Латиница, цифры, «.» и «_». Начинается со скоупа, после создания не меняется."
                    error={nameError}
                    disabled={loading}
                    autocomplete="off"
                    onValueChange={(value) => {
                        setName(value);
                        setNameError(undefined);
                    }}
                />
                <div key="scope-type" className={styles.row}>
                    <Select
                        key="scope"
                        id="new-key-scope"
                        label="Скоуп"
                        name="scope"
                        value={scope}
                        options={scopeOptions}
                        disabled={loading}
                        onValueChange={(value) => {
                            const selected = scopes.find((item) => item === value);
                            if (!selected) return;
                            setScope(selected);
                            setNameError(undefined);
                        }}
                    />
                    <Select
                        key="type"
                        id="new-key-type"
                        label="Тип"
                        name="type"
                        value={type}
                        options={types}
                        disabled={loading}
                        onValueChange={(value) => setType(value === 'flag' ? 'flag' : 'config')}
                    />
                </div>
                {type === 'config' && (
                    <Select
                        key="format"
                        id="new-key-format"
                        label="Формат значения"
                        name="format"
                        value="json"
                        options={formats}
                        disabled={loading}
                        onValueChange={() => {}}
                    />
                )}
                <Textarea
                    key="description"
                    id="new-key-description"
                    label="Описание"
                    name="description"
                    value={description}
                    disabled={loading}
                    onValueChange={setDescription}
                />
                {error && (
                    <p key="error" className={styles.error} role="alert">
                        {error}
                    </p>
                )}
                <div key="actions" className={styles.actions}>
                    <Button key="cancel" variant="secondary" disabled={loading} onClick={close}>
                        Отмена
                    </Button>
                    <Button
                        key="create"
                        type="submit"
                        disabled={loading || !name.trim() || Boolean(nameError)}
                        loading={loading}
                    >
                        Создать
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
