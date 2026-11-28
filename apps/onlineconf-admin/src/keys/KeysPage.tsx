import { useEffect, useState } from '@cdd-team/react';
import { Link, useNavigate, useSearch } from '@cdd-team/router';
import { api, type Output } from '@api/bff';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { Icon } from '@components/Icon/Icon';
import { Select } from '@components/Input/Select';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { Table, type Column } from '@components/Table/Table';
import { timeAgo } from '@utils/date';
import { domProps } from '@utils/dom-props';
import { plural } from '@utils/plural';
import { CreateKeyModal } from './CreateKeyModal';
import { scopes, valuePreview, type ConfItem } from './format';
import styles from './KeysPage.module.css';

type KeyList = Output<'/api/onlineconf/keys/list'>;
type Scope = KeyList['scopes'][number];
type KeyType = ConfItem['type'];

interface Filters {
    scope: Scope | '';
    type: KeyType | '';
}

const noFilters: Filters = { scope: '', type: '' };

const all = { value: '', label: 'Все' };
const typeOptions = [all, { value: 'config', label: 'Конфиг' }, { value: 'flag', label: 'Флаг' }];

/** Поиск и фильтры списка из адреса: так они переживают переход в карточку и обратно. */
export function keysSearch({ search, scope, type }: Record<string, unknown>): {
    search?: string;
    scope?: Scope;
    type?: KeyType;
} {
    // роутер разбирает `true` и `{…}` как JSON — возвращаем им вид строки
    const text =
        search === undefined || typeof search === 'string' ? search : JSON.stringify(search);
    // все три ключа всегда: роутер накладывает результат на сырые параметры адреса
    return {
        search: text?.slice(0, 256) || undefined,
        scope: scopes.find((item) => item === scope),
        type: type === 'config' || type === 'flag' ? type : undefined,
    };
}

const columns: Column<ConfItem>[] = [
    {
        key: 'name',
        header: 'Название',
        cell: ({ name }) => (
            <Link className={styles.name} to="/keys/$name" params={{ name }} title={name}>
                {name}
            </Link>
        ),
    },
    {
        key: 'type',
        header: 'Тип',
        cell: ({ type }) => (
            <span className={type === 'config' ? styles.config : undefined}>
                <Badge>{type === 'config' ? 'Конфиг' : 'Флаг'}</Badge>
            </span>
        ),
    },
    {
        key: 'scope',
        header: 'Скоуп',
        cell: ({ scope }) => <span className={styles.detail}>{scope}</span>,
    },
    {
        key: 'value',
        header: 'Значение',
        cell: (item) => {
            const value = valuePreview(item);
            const className =
                item.type === 'config' ? styles.value : item.enabled ? styles.enabled : styles.off;
            return (
                <span className={className} title={value}>
                    {value}
                </span>
            );
        },
    },
    {
        key: 'updated',
        header: 'Обновлён',
        cell: ({ updated_at }) => <span className={styles.detail}>{timeAgo(updated_at)}</span>,
    },
];

/** Список ключей OnlineConf с серверным поиском и фильтрами. */
export function KeysPage() {
    const saved = useSearch({ from: '/keys' });
    const navigate = useNavigate();
    const [search, setSearch] = useState(saved.search ?? '');
    const [creating, setCreating] = useState(false);
    const [request, setRequest] = useState({
        text: saved.search?.trim() ?? '',
        filters: { scope: saved.scope ?? '', type: saved.type ?? '' } as Filters,
        delayed: false,
    });
    const [settled, setSettled] = useState<{
        request: typeof request;
        status: 'ready' | 'failed';
    } | null>(null);
    const [data, setData] = useState<KeyList | null>(null);
    const { filters } = request;
    const state = settled?.request === request ? settled.status : 'loading';

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const {
            text,
            filters: { scope, type },
            delayed,
        } = request;
        const query = {
            ...(text && { search: text }),
            ...(scope && { scope }),
            ...(type && { type }),
        };
        const load = () => {
            // после debounce, а не на каждую букву: браузеры ограничивают частоту replaceState
            void navigate({ to: '/keys', search: query, replace: true });
            void api('GET', '/api/onlineconf/keys/list', {
                params: { query },
                init: { signal },
            }).then(
                (result) => {
                    if (signal.aborted) return;
                    setData(result);
                    setSettled({ request, status: 'ready' });
                },
                () => {
                    if (!signal.aborted) setSettled({ request, status: 'failed' });
                },
            );
        };
        const timer = delayed ? setTimeout(load, 250) : undefined;
        if (!delayed) load();
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [request, navigate]);

    return (
        <section aria-labelledby="keys-title">
            <div key="heading" className={styles.heading}>
                <div key="title">
                    <h1 key="name" id="keys-title" className={styles.title}>
                        Ключи
                    </h1>
                    {data && (
                        <p key="count" className={styles.detail}>
                            {plural(data.total_count, 'ключ', 'ключа', 'ключей')}
                            {' · '}
                            {plural(data.scope_count, 'скоуп', 'скоупа', 'скоупов')}
                        </p>
                    )}
                </div>
                <div key="actions" className={styles.actions}>
                    <div key="search" className={styles.search}>
                        <Icon key="icon" name="search" size={16} />
                        <input
                            key="input"
                            type="search"
                            aria-label="Поиск по названию"
                            placeholder="Поиск по названию"
                            value={search}
                            {...domProps({ maxlength: 256 })}
                            onInput={(event) => {
                                const value = (event.target as HTMLInputElement).value;
                                setSearch(value);
                                const trimmed = value.trim();
                                setRequest((current) =>
                                    current.text === trimmed
                                        ? current
                                        : { ...current, text: trimmed, delayed: true },
                                );
                            }}
                        />
                    </div>
                    <Button key="create" icon="plus" onClick={() => setCreating(true)}>
                        Создать ключ
                    </Button>
                </div>
            </div>
            <div key="filters" className={styles.filters}>
                <Select
                    key="scope"
                    id="key-scope"
                    name="scope"
                    label="Скоуп"
                    value={filters.scope}
                    options={[
                        all,
                        ...(data?.scopes ?? []).map((scope) => ({ value: scope, label: scope })),
                    ]}
                    onValueChange={(value) => {
                        const scope = data?.scopes.find((item) => item === value) ?? '';
                        setRequest((current) => ({
                            ...current,
                            filters: { ...current.filters, scope },
                            delayed: false,
                        }));
                    }}
                />
                <Select
                    key="type"
                    id="key-type"
                    name="type"
                    label="Тип"
                    value={filters.type}
                    options={typeOptions}
                    onValueChange={(value) => {
                        const type = value === 'config' || value === 'flag' ? value : '';
                        setRequest((current) => ({
                            ...current,
                            filters: { ...current.filters, type },
                            delayed: false,
                        }));
                    }}
                />
            </div>
            <div key="results" aria-busy={state === 'loading'}>
                {state === 'loading' && <p aria-live="polite">Загружаем ключи…</p>}
                {state === 'failed' && (
                    <StateBlock
                        error
                        title="Не удалось загрузить ключи"
                        description="Попробуйте ещё раз."
                    >
                        <Button
                            variant="secondary"
                            onClick={() =>
                                setRequest((current) => ({ ...current, delayed: false }))
                            }
                        >
                            Повторить
                        </Button>
                    </StateBlock>
                )}
                {state === 'ready' && data && (
                    <KeyResults
                        data={data}
                        search={request.text}
                        onReset={() => {
                            setSearch('');
                            setRequest({ text: '', filters: noFilters, delayed: false });
                        }}
                    />
                )}
            </div>
            {creating && (
                <CreateKeyModal
                    key="create"
                    initialScope={filters.scope}
                    onClose={() => setCreating(false)}
                />
            )}
        </section>
    );
}

/** Строки списка или соответствующее пустое состояние. */
function KeyResults({
    data,
    search,
    onReset,
}: {
    data: KeyList;
    search: string;
    onReset: () => void;
}) {
    if (data.total_count === 0) {
        return (
            <StateBlock
                title="Ключей пока нет"
                description="Здесь появятся конфиги и флаги OnlineConf."
            />
        );
    }
    if (data.items.length === 0) {
        return (
            <div className={styles.empty}>
                <Icon key="icon" name="search" size={32} />
                <h2 key="title">Ничего не найдено</h2>
                <p key="description" className={styles.detail}>
                    {search
                        ? `Нет ключей с «${search}» в названии. Проверьте написание или сбросьте фильтры.`
                        : 'Нет ключей с такими параметрами. Сбросьте фильтры.'}
                </p>
                <Button key="reset" variant="secondary" onClick={onReset}>
                    Сбросить поиск
                </Button>
            </div>
        );
    }
    return (
        <div className={styles.table}>
            <Table
                caption="Ключи OnlineConf"
                columns={columns}
                rows={data.items}
                rowKey={(item) => item.name}
            />
        </div>
    );
}
