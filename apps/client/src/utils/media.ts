import { useSyncExternalStore } from '@cdd-team/react';

// Хук значения media query: меняется вместе с устройством и настройками без перезагрузки
function mediaHook(media: string): () => boolean {
    const query = window.matchMedia(media);
    const subscribe = (onChange: () => void): (() => void) => {
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    };
    return () => useSyncExternalStore(subscribe, () => query.matches);
}

/** Основной указатель — палец: блокнот только для чтения. */
export const useTouchDevice = mediaHook('(pointer: coarse)');

/** Режим системных цветов (высокая контрастность): слои подсветки под полями скрыты. */
export const useForcedColors = mediaHook('(forced-colors: active)');
