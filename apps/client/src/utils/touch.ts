import { useSyncExternalStore } from '@cdd-team/react';

const query = window.matchMedia('(pointer: coarse)');

const subscribe = (onChange: () => void): (() => void) => {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};

/**
 * Основной указатель — палец: блокнот только для чтения.
 * @returns true на тач-устройстве; меняется вместе с устройством без перезагрузки
 */
export function useTouchDevice(): boolean {
    return useSyncExternalStore(subscribe, () => query.matches);
}
