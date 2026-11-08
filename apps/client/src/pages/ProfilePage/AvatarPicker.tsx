import { useEffect, useState } from '@cdd-team/react';

import { Avatar } from '@components/Avatar/Avatar';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { uploadAvatar, useSessionStore } from '@stores/session';
import { showSnackbar } from '@stores/snackbar';
import { showToast } from '@stores/toast';
import { AVATAR_RULE, checkAvatar } from '@utils/avatar';
import styles from './ProfilePage.module.css';

const INPUT_ID = 'profile-avatar-file';

/**
 * Аватар и логин профиля с кнопкой «Изменить фото»: выбор одного JPEG/PNG, проверка и загрузка.
 * Прежнее фото остаётся, пока Go не подтвердит новое.
 */
export function AvatarPicker() {
    const user = useSessionStore((state) => state.user);
    const [pending, setPending] = useState(false);
    const [life] = useState({ alive: true });

    useEffect(
        () => () => {
            life.alive = false;
        },
        [life],
    );

    const pick = async (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        // сброс: тот же файл можно выбрать снова
        input.value = '';
        if (!file) return;
        setPending(true);
        const error = (await checkAvatar(file)) ? await uploadAvatar(file) : 'file';
        if (!life.alive) return;
        setPending(false);
        if (error === 'file') showSnackbar(`Файл не подходит: ${AVATAR_RULE}`);
        else if (error === 'upload') showSnackbar('Не удалось загрузить фото. Попробуйте ещё раз');
        else showToast('Аватар обновлён');
    };

    return (
        <div className={styles.identity}>
            <Avatar
                key="avatar"
                login={user?.login ?? ''}
                src={user?.avatar_url}
                className={styles.avatar}
            />
            <div key="about" className={styles.about}>
                <span key="login" className={styles.login}>
                    {user?.login}
                </span>
                <div key="controls" className={styles.photoControls}>
                    <input
                        key="input"
                        id={INPUT_ID}
                        className={styles.fileInput}
                        type="file"
                        accept="image/jpeg,image/png"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(event: Event) => void pick(event)}
                    />
                    <Button
                        key="change"
                        variant="secondary"
                        loading={pending}
                        onClick={() => document.getElementById(INPUT_ID)?.click()}
                    >
                        {pending ? 'Загружаем…' : 'Изменить фото'}
                    </Button>
                    <span key="hint" className={styles.photoHint}>
                        <Icon key="icon" name="info" />
                        {AVATAR_RULE}
                    </span>
                </div>
            </div>
        </div>
    );
}
