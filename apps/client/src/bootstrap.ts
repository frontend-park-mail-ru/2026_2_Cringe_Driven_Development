import type { BootstrapData } from '@cdd/bff';

const MARKER_ID = 'bootstrap';

/** Первый HTML без корректного `<script id="bootstrap">`: приложение не запускается. */
export class BootstrapError extends Error {
    constructor(reason: string) {
        super(`Повреждены данные первой страницы: ${reason}`);
        this.name = 'BootstrapError';
    }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Данные, которые BFF положил в первый HTML. Блок должен быть ровно один, `<script>` с
 * `type="application/json"`, а в нём — `{ user: объект | null }` и, на странице своего блокнота,
 * `notebookPage`. Иначе — `BootstrapError`:
 * гостем вместо пользователя и запасным запросом дефект не прикрывается.
 * @returns пользователь или `null` для гостя
 */
export function readBootstrap(): BootstrapData {
    const found = document.querySelectorAll(`[id="${MARKER_ID}"]`);
    if (found.length !== 1) throw new BootstrapError(`элементов #${MARKER_ID}: ${found.length}`);
    const element = found[0];
    if (!(element instanceof HTMLScriptElement) || element.type !== 'application/json') {
        throw new BootstrapError('ожидался <script type="application/json">');
    }
    let data: unknown;
    try {
        data = JSON.parse(element.textContent ?? '');
    } catch {
        throw new BootstrapError('не JSON');
    }
    if (!isObject(data) || !('user' in data)) throw new BootstrapError('нет поля user');
    const { user } = data;
    if (
        user !== null &&
        !(isObject(user) && typeof user.id === 'number' && typeof user.login === 'string')
    ) {
        throw new BootstrapError('user — не пользователь и не null');
    }
    if ('notebookPage' in data) {
        const page = data.notebookPage;
        const notebook = isObject(page) ? page.notebook : undefined;
        if (
            !isObject(notebook) ||
            typeof notebook.id !== 'number' ||
            typeof notebook.name !== 'string' ||
            typeof notebook.hash !== 'string' ||
            !Array.isArray(notebook.cells)
        ) {
            throw new BootstrapError('notebookPage — не блокнот');
        }
        const { active_session: active, runtime_queue: queue } = page as Record<string, unknown>;
        if (active !== null && !(isObject(active) && typeof active.id === 'string')) {
            throw new BootstrapError('active_session — не сессия и не null');
        }
        if (queue !== null && !(isObject(queue) && Array.isArray(queue.items))) {
            throw new BootstrapError('runtime_queue — не очередь и не null');
        }
    }
    return data as BootstrapData;
}
