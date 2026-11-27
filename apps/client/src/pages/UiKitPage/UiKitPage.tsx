import { useEffect, useState } from '@cdd-team/react';
import { Link } from '@cdd-team/router';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { Header } from '@components/Header/Header';
import { Iframe } from '@components/Iframe/Iframe';
import { ImagePreview } from '@components/ImagePreview/ImagePreview';
import { Input } from '@components/Input/Input';
import { Select } from '@components/Input/Select';
import { Textarea } from '@components/Input/Textarea';
import { Logo } from '@components/Logo/Logo';
import { Modal } from '@components/Modal/Modal';
import { ProfileLink } from '@components/ProfileLink/ProfileLink';
import { Table, type Column } from '@components/Table/Table';
import { showToast } from '@stores/toast';
import styles from './UiKitPage.module.css';

const LANGUAGES = [
    { value: 'python', label: 'Python' },
    { value: 'markdown', label: 'Markdown' },
];

/** Блокнот из примера таблицы. */
interface SampleNotebook {
    id: string;
    title: string;
    published: boolean;
    cells: number;
    updated: string;
}

const NOTEBOOKS: readonly SampleNotebook[] = [
    { id: '1', title: 'Анализ продаж', published: true, cells: 12, updated: '2 часа назад' },
    { id: '2', title: 'Очистка данных', published: false, cells: 5, updated: 'вчера' },
    { id: '3', title: 'Модель спроса', published: false, cells: 27, updated: '3 дня назад' },
];

const COLUMNS: readonly Column<SampleNotebook>[] = [
    {
        key: 'title',
        header: 'Название',
        cell: (row) => (
            <span className={styles.name}>
                {row.title}
                <Badge key="badge">{row.published ? 'Опубликован' : 'Черновик'}</Badge>
            </span>
        ),
    },
    { key: 'cells', header: 'Ячеек', cell: (row) => String(row.cells) },
    { key: 'updated', header: 'Изменён', cell: (row) => row.updated },
    {
        key: 'action',
        header: 'Действие',
        cell: (row) => (
            <Button variant="secondary" onClick={() => showToast(`Открыт «${row.title}»`)}>
                Открыть
            </Button>
        ),
    },
];

const LOG = new Blob(['run 1: ok\nrun 2: ok\nrun 3: выполнено 12 ячеек\n'], { type: 'text/plain' });

/** Пример файла: имя, размер и ссылка «Скачать» на лог, собранный в браузере. */
function FileExample() {
    const [href, setHref] = useState('');
    useEffect(() => {
        const url = URL.createObjectURL(LOG);
        setHref(url);
        return () => URL.revokeObjectURL(url);
    }, []);
    return (
        <p className={styles.file}>
            <span key="name">run.log</span>
            <span key="size" className={styles.muted}>
                {`${LOG.size} Б`}
            </span>
            {href && (
                <a key="download" href={href} download="run.log">
                    Скачать
                </a>
            )}
        </p>
    );
}

/** Витрина компонентов UI-kit на нейтральных данных блокнотов. */
export function UiKitPage() {
    const [title, setTitle] = useState('Анализ продаж');
    const [description, setDescription] = useState('');
    const [language, setLanguage] = useState('python');
    const [modal, setModal] = useState(false);
    const [embed, setEmbed] = useState(false);

    /** Поля формы; в модалке — с другим префиксом id */
    const fields = (prefix: string) => [
        <Input
            key="title"
            id={`${prefix}-name`}
            label="Название блокнота"
            name="title"
            value={title}
            autocomplete="off"
            onValueChange={setTitle}
        />,
        <Textarea
            key="description"
            id={`${prefix}-description`}
            label="Описание"
            name="description"
            value={description}
            placeholder="О чём этот блокнот"
            hint="Видно в карточке блокнота"
            onValueChange={setDescription}
        />,
        <Select
            key="language"
            id={`${prefix}-language`}
            label="Язык первой ячейки"
            name="language"
            value={language}
            options={LANGUAGES}
            onValueChange={setLanguage}
        />,
        <Select
            key="runtime"
            id={`${prefix}-runtime`}
            label="Окружение"
            name="runtime"
            value="python"
            options={LANGUAGES}
            disabled
            onValueChange={() => {}}
        />,
    ];

    return (
        <div className={styles.page}>
            <Header key="header">
                <Link
                    key="home"
                    to="/"
                    className={styles.home}
                    aria-label="Cellestial — на главную"
                >
                    <Logo />
                </Link>
                <ProfileLink key="profile" />
            </Header>
            <div key="content" className={styles.content}>
                <h1 key="title" className={styles.title}>
                    UI-kit
                </h1>

                <section key="fields" className={styles.section}>
                    <h2 key="title">Поля</h2>
                    <div key="form" className={styles.form}>
                        {fields('kit')}
                        <Textarea
                            key="error"
                            id="kit-comment"
                            label="Комментарий"
                            name="comment"
                            value=""
                            error="Напишите комментарий"
                            onValueChange={() => {}}
                        />
                    </div>
                    <Button key="modal" variant="secondary" onClick={() => setModal(true)}>
                        Открыть в модалке
                    </Button>
                </section>

                <section key="table" className={styles.section}>
                    <h2 key="title">Таблица</h2>
                    <Table
                        key="table"
                        id="kit-notebooks"
                        caption="Блокноты"
                        columns={COLUMNS}
                        rows={NOTEBOOKS}
                        rowKey={(row) => row.id}
                    />
                </section>

                <section key="files" className={styles.section}>
                    <h2 key="title">Файлы</h2>
                    <ImagePreview
                        key="image"
                        id="kit-image"
                        src="/pwa-512.png"
                        alt="Значок Cellestial"
                    />
                    <FileExample key="file" />
                </section>

                <section key="embed" className={styles.section}>
                    <h2 key="title">Встраивание</h2>
                    <Button
                        key="toggle"
                        variant="secondary"
                        expanded={embed}
                        onClick={() => setEmbed((current) => !current)}
                    >
                        {embed ? 'Скрыть встраивание' : 'Показать встраивание'}
                    </Button>
                    {embed && (
                        <Iframe
                            key="iframe"
                            src="/embed/preview"
                            title="Пример встроенной страницы"
                        />
                    )}
                </section>
            </div>
            {modal && (
                <Modal
                    key="modal"
                    title="Поля в модалке"
                    initialFocusId="dialog-name"
                    onClose={() => setModal(false)}
                >
                    <div className={styles.form}>{fields('dialog')}</div>
                </Modal>
            )}
        </div>
    );
}
