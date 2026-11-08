import { useEffect, useState, useSyncExternalStore } from '@cdd-team/react';

import type { RouterOutputs } from '@cdd/bff';
import { isRpcError, trpc } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Input } from '@components/Input/Input';
import { Modal } from '@components/Modal/Modal';
import { OTP_LENGTH, OtpInput } from '@components/OtpInput/OtpInput';
import { useSessionStore } from '@stores/session';
import { hideSnackbar, showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import styles from './ProfilePage.module.css';

type Setup = RouterOutputs['twoFactor']['setup'];
type Step = 'qr' | 'manual' | 'code';
type Copy = 'idle' | 'copied' | 'failed';

const CONTINUE_ID = 'two-factor-continue';
const CODE_ID = 'two-factor-code';
const PASSWORD_ID = 'two-factor-password';
const KEY_ID = 'two-factor-key';
const INVALID_CODE = 'Неверный код. Попробуйте ещё раз';

// телефонная раскладка макета: ручной ключ — отдельным шагом без QR
const narrow = window.matchMedia('(max-width: 860px)');
const subscribe = (onChange: () => void): (() => void) => {
    narrow.addEventListener('change', onChange);
    return () => narrow.removeEventListener('change', onChange);
};
const useNarrow = (): boolean => useSyncExternalStore(subscribe, () => narrow.matches);

const appCodeOf = (error: unknown): string | undefined =>
    isRpcError(error) ? error.data?.appCode : undefined;

const setHas2fa = (has_2fa: boolean): void =>
    useSessionStore.setState((state) => ({ user: state.user && { ...state.user, has_2fa } }));

/**
 * Раздел «Двухфакторная аутентификация» (Profile / Section 2FA): статус и действие справа.
 * «Подключить» — `twoFactor.setup` и окно с QR, ручным ключом и вводом кода; только успешный
 * `twoFactor.confirm` включает 2FA. «Отключить» — окно с паролем и `twoFactor.disable`.
 * Данные настройки живут в памяти, пока открыто окно.
 * @returns раздел и его окна
 */
export function TwoFactorSection() {
    const enabled = useSessionStore((state) => state.user?.has_2fa ?? false);
    const [setup, setSetup] = useState<Setup | null>(null);
    const [disabling, setDisabling] = useState(false);
    const [pending, setPending] = useState(false);
    const [snackbarId, setSnackbarId] = useState(0);
    const [life] = useState({ alive: true });

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    useEffect(() => () => hideSnackbar(snackbarId), [snackbarId]);

    const start = async () => {
        setPending(true);
        hideSnackbar(snackbarId);
        try {
            const data = await trpc.twoFactor.setup.mutate();
            if (life.alive) setSetup(data);
        } catch (error) {
            if (!life.alive) return;
            if (appCodeOf(error) === 'validation_error') {
                setHas2fa(true);
                setSnackbarId(showSnackbar('2FA уже подключена'));
            } else {
                setSnackbarId(
                    showSnackbar('Не удалось подключить 2FA', {
                        label: 'Повторить',
                        onClick: () => void start(),
                    }),
                );
            }
        } finally {
            if (life.alive) setPending(false);
        }
    };

    // окна — вне секции: её backdrop-filter стал бы содержащим блоком для fixed-затемнения
    return (
        <>
            <section key="section" className={styles.section}>
                <h2 key="title" className={styles.sectionTitle}>
                    Двухфакторная аутентификация
                </h2>
                <div key="authenticator" className={styles.authenticator}>
                    <div key="text" className={styles.authenticatorText}>
                        <p key="name" className={styles.authenticatorName}>
                            Приложение-аутентификатор
                        </p>
                        <p key="status" className={styles.authenticatorStatus}>
                            {enabled
                                ? 'Подключено. При входе потребуется код'
                                : 'Не подключено. Для входа достаточно пароля'}
                        </p>
                    </div>
                    <Button
                        key="action"
                        variant="secondary"
                        className={styles.authenticatorAction}
                        loading={pending}
                        onClick={() => (enabled ? setDisabling(true) : void start())}
                    >
                        {enabled ? 'Отключить' : 'Подключить'}
                    </Button>
                </div>
            </section>
            {setup && <EnableModal key="enable" setup={setup} onClose={() => setSetup(null)} />}
            {disabling && <DisableModal key="disable" onClose={() => setDisabling(false)} />}
        </>
    );
}

/** Свойства {@link EnableModal}. */
interface EnableModalProps {
    setup: Setup;
    onClose: () => void;
}

/**
 * Подключение 2FA: QR-код, ручной ключ для аутентификатора на том же телефоне, затем код.
 * Шаг и ключ живут, пока окно открыто: переход в аутентификатор и обратно их не теряет.
 * @param props данные настройки и закрытие окна
 * @returns окно
 */
function EnableModal({ setup, onClose }: EnableModalProps) {
    const isNarrow = useNarrow();
    const [step, setStep] = useState<Step>('qr');
    const [copy, setCopy] = useState<Copy>('idle');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | undefined>(undefined);
    const [pending, setPending] = useState(false);
    const [life] = useState({ alive: true });

    useEffect(
        () => () => {
            life.alive = false;
            hideSnackbar();
        },
        [life],
    );

    // ручной ключ на телефоне — без QR и с «Назад», на десктопе — под QR
    const keyStep = step === 'manual';
    const keyOnly = keyStep && isNarrow;

    const copyKey = async () => {
        try {
            await navigator.clipboard.writeText(setup.secret);
            if (life.alive) setCopy('copied');
        } catch {
            if (!life.alive) return;
            setCopy('failed');
            const key = document.getElementById(KEY_ID);
            if (key) window.getSelection()?.selectAllChildren(key);
        }
    };

    const confirm = async (value: string) => {
        if (pending || value.length < OTP_LENGTH) return;
        setPending(true);
        setError(undefined);
        hideSnackbar();
        try {
            await trpc.twoFactor.confirm.mutate({ user_code: value });
            setHas2fa(true);
            showToast('2FA подключена');
            onClose();
        } catch (failure) {
            if (!life.alive) return;
            setPending(false);
            if (appCodeOf(failure) === 'invalid_totp') {
                setError(INVALID_CODE);
                return;
            }
            showSnackbar('Не удалось подключить 2FA', {
                label: 'Повторить',
                onClick: () => void confirm(value),
            });
        }
    };

    const close = () => {
        if (!pending) onClose();
    };

    if (step === 'code') {
        return (
            <Modal
                title="Подтвердите подключение"
                description="Введите 6-значный код из приложения."
                initialFocusId={CODE_ID}
                onClose={close}
            >
                <form
                    className={styles.dialogBody}
                    noValidate
                    onSubmit={(event: Event) => {
                        event.preventDefault();
                        void confirm(code);
                    }}
                >
                    <div key="qr" className={styles.qr}>
                        <img
                            key="image"
                            className={styles.qrImage}
                            src={setup.qr_code}
                            alt="QR-код для приложения-аутентификатора"
                        />
                    </div>
                    <OtpInput
                        key="code"
                        id={CODE_ID}
                        label="Код из приложения"
                        value={code}
                        error={error}
                        disabled={pending}
                        onValueChange={(value) => {
                            setCode(value);
                            setError(undefined);
                            hideSnackbar();
                        }}
                        onComplete={(value) => void confirm(value)}
                    />
                    <Button
                        key="submit"
                        type="submit"
                        loading={pending}
                        disabled={code.length < OTP_LENGTH}
                        block
                    >
                        Подтвердить
                    </Button>
                </form>
            </Modal>
        );
    }

    return (
        <Modal
            title="Подключите приложение"
            description={
                keyOnly
                    ? 'Добавьте ключ в Яндекс Ключ или Google Authenticator.'
                    : 'Отсканируйте QR-код в Яндекс Ключе или Google Authenticator и нажмите «Продолжить».'
            }
            initialFocusId={CONTINUE_ID}
            onBack={keyOnly ? () => setStep('qr') : undefined}
            onClose={close}
        >
            <div className={styles.dialogBody}>
                <div key="qr" className={styles.qr}>
                    {!keyOnly && (
                        <img
                            key="image"
                            className={styles.qrImage}
                            src={setup.qr_code}
                            alt="QR-код для приложения-аутентификатора"
                        />
                    )}
                    {!keyStep && (
                        <p key="manual" className={styles.qrNote}>
                            Настраиваете на этом телефоне?{' '}
                            <button
                                type="button"
                                className={styles.link}
                                onClick={() => setStep('manual')}
                            >
                                Добавить вручную
                            </button>
                        </p>
                    )}
                    {keyStep && (
                        <div key="key" className={styles.manualKey}>
                            <p key="label" className={styles.keyLabel}>
                                Ключ настройки
                            </p>
                            {/* группы по 4 — отступами, а не пробелами: выделенный ключ копируется без разделителей */}
                            <p
                                key="value"
                                id={KEY_ID}
                                className={copy === 'failed' ? styles.keySelected : styles.key}
                            >
                                {setup.secret.match(/.{1,4}/g)?.map((group, index) => (
                                    <span key={`${index}`} className={styles.keyGroup}>
                                        {group}
                                    </span>
                                ))}
                            </p>
                            <Button
                                key="copy"
                                variant="secondary"
                                block
                                onClick={() => void copyKey()}
                            >
                                Скопировать ключ
                            </Button>
                            {copy !== 'idle' && (
                                <p
                                    key="feedback"
                                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                                    role="status"
                                    className={
                                        copy === 'copied' ? styles.copySuccess : styles.copyError
                                    }
                                >
                                    <Icon
                                        key="icon"
                                        name={copy === 'copied' ? 'check' : 'alert'}
                                        className={styles.copyIcon}
                                    />
                                    <span key="text">
                                        {copy === 'copied'
                                            ? 'Ключ скопирован'
                                            : 'Не удалось скопировать. Выделите ключ и скопируйте вручную'}
                                    </span>
                                </p>
                            )}
                            <ol key="steps" className={styles.keySteps}>
                                <li key="1">1. В аутентификаторе выберите «Добавить вручную».</li>
                                <li key="2">2. Вставьте ключ и назовите аккаунт Cellestial.</li>
                                <li key="3">3. Вернитесь сюда и нажмите «Продолжить».</li>
                            </ol>
                            <p key="hint" className={styles.keyHint}>
                                Если приложение попросит тип ключа, выберите «По времени».
                            </p>
                        </div>
                    )}
                    {!keyOnly && (
                        <p key="note" className={styles.qrNote}>
                            2FA включится только после проверки кода из приложения.
                        </p>
                    )}
                </div>
                <Button key="continue" id={CONTINUE_ID} block onClick={() => setStep('code')}>
                    Продолжить
                </Button>
            </div>
        </Modal>
    );
}

/** Свойства {@link DisableModal}. */
interface DisableModalProps {
    onClose: () => void;
}

/**
 * Отключение 2FA по текущему паролю. Неверный пароль — ошибка у поля, окно остаётся.
 * @param props закрытие окна
 * @returns окно
 */
function DisableModal({ onClose }: DisableModalProps) {
    const [password, setPassword] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [pending, setPending] = useState(false);
    const [life] = useState({ alive: true });

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    const disable = async () => {
        if (pending || password === '') return;
        setPending(true);
        setError(undefined);
        hideSnackbar();
        try {
            await trpc.twoFactor.disable.mutate({ password });
            setHas2fa(false);
            showToast('2FA отключена');
            onClose();
        } catch (failure) {
            if (!life.alive) return;
            setPending(false);
            const code = appCodeOf(failure);
            if (code === 'invalid_current_password') {
                setError('Неверный пароль');
                document.getElementById(PASSWORD_ID)?.focus();
            } else if (code === 'validation_error') {
                setHas2fa(false);
                onClose();
                showSnackbar('2FA уже отключена');
            } else {
                showSnackbar('Не удалось отключить 2FA', {
                    label: 'Повторить',
                    onClick: () => void disable(),
                });
            }
        }
    };

    return (
        <Modal
            title="Отключить 2FA?"
            description="Введите текущий пароль. После отключения для входа будет достаточно логина и пароля."
            initialFocusId={PASSWORD_ID}
            onClose={() => !pending && onClose()}
        >
            <form
                className={styles.dialogBody}
                noValidate
                onSubmit={(event: Event) => {
                    event.preventDefault();
                    void disable();
                }}
            >
                <Input
                    key="password"
                    id={PASSWORD_ID}
                    label="Текущий пароль"
                    type="password"
                    name="password"
                    value={password}
                    placeholder="Введите пароль"
                    error={error}
                    disabled={pending}
                    autocomplete="current-password"
                    revealed={revealed}
                    onToggleReveal={() => setRevealed((current) => !current)}
                    onValueChange={(value) => {
                        setPassword(value);
                        setError(undefined);
                    }}
                />
                <div key="actions" className={styles.dialogActions}>
                    <Button key="cancel" variant="secondary" disabled={pending} onClick={onClose}>
                        Отменить
                    </Button>
                    <Button
                        key="disable"
                        type="submit"
                        variant="danger"
                        loading={pending}
                        disabled={password === ''}
                    >
                        Отключить
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
