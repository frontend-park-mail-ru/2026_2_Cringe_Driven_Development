import { clsx } from '@cdd-team/clsx';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Modal } from '@components/Modal/Modal';
import {
    closeConflictDialog,
    dismissOrphan,
    openConflictDialog,
    resolveConflict,
    retryConflictLoad,
    useNotebookStore,
    type Orphan,
} from '@stores/notebook';
import { showToast } from '@stores/toast';
import styles from './Conflict.module.css';

const SERVER_ID = 'conflict-server';

const BANNER = {
    loading: {
        title: 'Конфликт сохранения: загружаем актуальную версию',
        text: 'Ваши правки остаются в редакторе. Выбрать версию можно после загрузки.',
    },
    failed: {
        title: 'Не удалось загрузить актуальную версию',
        text: 'Ваши правки остаются в редакторе, сохранение приостановлено. Повторите загрузку, чтобы выбрать версию.',
    },
    ready: {
        title: 'Конфликт сохранения',
        text: 'Блокнот изменили в другой вкладке или браузере. Ваши правки в редакторе, сохранение приостановлено до выбора версии.',
    },
};

/** Свойства {@link ConflictBanner}. */
interface ConflictBannerProps {
    className?: string;
}

/**
 * Предупреждение над ячейками, пока конфликт сохранения не разрешён: загрузка свежей версии,
 * ошибка её загрузки или повторное открытие диалога.
 * @param props свойства баннера
 * @returns баннер или ничего
 */
export function ConflictBanner({ className }: ConflictBannerProps) {
    const conflict = useNotebookStore((state) => state.conflict);
    if (conflict.phase === 'none' || conflict.phase === 'resolving') return null;
    const banner = BANNER[conflict.phase];
    return (
        // Нажатие мышью на кнопку не забирает фокус у редактора: открытый ею диалог вернёт его
        // туда же, Markdown-ячейка остаётся в редактировании с прежним курсором
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
            className={clsx(styles.banner, className)}
            role="alert"
            onMouseDown={(event) => {
                if ((event.target as Element).closest('button')) event.preventDefault();
            }}
        >
            <Icon key="icon" name="alert" className={styles.alert} />
            <div key="text" className={styles.text}>
                <p key="title" className={styles.title}>
                    {banner.title}
                </p>
                <p key="body" className={styles.body}>
                    {banner.text}
                </p>
            </div>
            {conflict.phase === 'failed' ? (
                <Button
                    key="retry"
                    variant="secondary"
                    className={styles.action}
                    onClick={() => void retryConflictLoad()}
                >
                    Повторить
                </Button>
            ) : (
                <Button
                    key="resolve"
                    className={styles.action}
                    disabled={conflict.phase === 'loading'}
                    onClick={openConflictDialog}
                >
                    Разрешить конфликт
                </Button>
            )}
        </div>
    );
}

// Тост — только когда выбор подтверждён; иначе снова открывается диалог конфликта
const choose = (choice: 'server' | 'mine'): void => {
    void resolveConflict(choice).then((ok) => {
        if (!ok) return;
        showToast(choice === 'mine' ? 'Ваш текст сохранён' : 'Загружена актуальная версия');
    });
};

/**
 * Диалог выбора версии при конфликте сохранения. Крестик, Escape и клик по фону закрывают его без
 * выбора: черновики и пауза сохранения остаются.
 * @returns диалог или ничего
 */
export function ConflictDialog() {
    const conflict = useNotebookStore((state) => state.conflict);
    const open = conflict.phase === 'ready' ? conflict.dialogOpen : conflict.phase === 'resolving';
    if (!open) return null;
    const saving = conflict.phase === 'resolving';
    return (
        <Modal
            title="Конфликт сохранения"
            description="Блокнот изменили в другой вкладке или браузере. Мы загрузили актуальную версию, ваш текст пока в редакторе. Выберите, что оставить."
            initialFocusId={SERVER_ID}
            closeOnBackdrop
            onClose={closeConflictDialog}
        >
            <div className={styles.options}>
                <div key="server" className={styles.option}>
                    <Button
                        key="button"
                        id={SERVER_ID}
                        variant="secondary"
                        block
                        disabled={saving}
                        onClick={() => choose('server')}
                    >
                        Загрузить серверную версию
                    </Button>
                    <p key="warning" className={styles.warning}>
                        Ваши несохранённые изменения в этом блокноте будут потеряны.
                    </p>
                </div>
                <div key="mine" className={styles.option}>
                    <Button
                        key="button"
                        block
                        loading={saving}
                        disabled={saving}
                        onClick={() => choose('mine')}
                    >
                        {saving ? 'Сохраняем…' : 'Сохранить мой текст'}
                    </Button>
                    <p key="warning" className={styles.warning}>
                        Ваш текст заменит текст затронутых ячеек в актуальной версии блокнота.
                    </p>
                </div>
            </div>
        </Modal>
    );
}

/** Свойства {@link OrphanDraft}. */
interface OrphanDraftProps {
    orphan: Orphan;
}

/**
 * Черновик ячейки, которую удалили в другой вкладке: только для чтения и копирования, сама ячейка
 * не воссоздаётся.
 * @param props свойства блока
 * @returns блок с текстом
 */
export function OrphanDraft({ orphan }: OrphanDraftProps) {
    return (
        <div className={styles.orphan}>
            <div key="head" className={styles.orphanHead}>
                <Icon key="icon" name="alert" className={styles.alert} />
                <p key="title" className={styles.orphanTitle}>
                    Ячейку удалили в другой вкладке — ваш текст можно скопировать
                </p>
                <Button
                    key="dismiss"
                    variant="secondary"
                    onClick={() => dismissOrphan(orphan.cellId)}
                >
                    Убрать
                </Button>
            </div>
            <pre
                key="text"
                className={clsx(styles.orphanText, orphan.kind === 'code' && styles.code)}
            >
                {orphan.text}
            </pre>
        </div>
    );
}
