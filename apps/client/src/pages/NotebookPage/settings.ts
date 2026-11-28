import { useCallback, useEffect, useState } from '@cdd-team/react';

import { readOnlineConf } from '@api/onlineconf';
import { useNotebookStore } from '@stores/notebook';
import { useRuntimeStore } from '@stores/runtime';
import type { Settings } from './status';

/** Отказы, после которых настройки на экране могли устареть. */
const STALE = new Set<string | null>([
    'too_many_cells',
    'settings_unavailable',
    'run_all_disabled',
]);

/**
 * Настройки OnlineConf открытого блокнота. Читаются при каждом его открытии и один раз после
 * отказа сервера по лимиту, флагу или из-за недоступных настроек. Ответ на прежнее чтение не
 * применяется.
 * @param notebookId открытый блокнот
 */
export function useSettings(notebookId: number): Settings {
    const [state, setState] = useState<{ id: number; value: Settings }>({
        id: notebookId,
        value: 'loading',
    });
    const [attempt, setAttempt] = useState(0);
    const reload = useCallback(() => setAttempt((current) => current + 1), []);

    useEffect(() => {
        const controller = new AbortController();
        // при повторном чтении того же блокнота прежнее значение держится до ответа
        setState((current) =>
            current.id === notebookId ? current : { id: notebookId, value: 'loading' },
        );
        const apply = (value: Settings) => {
            if (!controller.signal.aborted) setState({ id: notebookId, value });
        };
        readOnlineConf(controller.signal).then(apply, () => apply('unavailable'));
        return () => controller.abort();
    }, [notebookId, attempt]);

    // подписка, а не эффект по error: оставшаяся в сторе прежняя ошибка не читает настройки снова
    useEffect(() => {
        const listen = (
            next: { error: string | null; failure: number },
            previous: { failure: number },
        ) => {
            if (next.failure !== previous.failure && STALE.has(next.error)) reload();
        };
        const stops = [useNotebookStore.subscribe(listen), useRuntimeStore.subscribe(listen)];
        return () => stops.forEach((stop) => stop());
    }, [reload]);

    return state.id === notebookId ? state.value : 'loading';
}
