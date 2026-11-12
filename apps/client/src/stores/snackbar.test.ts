/// <reference types="bun" />
import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { hideSnackbar, showSnackbar, useSnackbarStore } from './snackbar';

const current = () => useSnackbarStore.getState().snackbar;

beforeEach(() => {
    jest.useFakeTimers();
    useSnackbarStore.setState({ snackbar: null });
});

afterEach(() => {
    jest.useRealTimers();
});

test('скрывается через durationMs', () => {
    showSnackbar('a', undefined, 4000);
    jest.advanceTimersByTime(3999);
    expect(current()?.text).toBe('a');
    jest.advanceTimersByTime(1);
    expect(current()).toBeNull();
});

test('без durationMs висит', () => {
    showSnackbar('a');
    jest.advanceTimersByTime(60_000);
    expect(current()?.text).toBe('a');
});

test('старый таймер не скрывает новый снэкбар', () => {
    showSnackbar('a', undefined, 4000);
    jest.advanceTimersByTime(2000);
    showSnackbar('b');
    jest.advanceTimersByTime(2000);
    expect(current()?.text).toBe('b');
});

test('hideSnackbar чужого id не убирает текущий', () => {
    const id = showSnackbar('a');
    showSnackbar('b');
    hideSnackbar(id);
    expect(current()?.text).toBe('b');
});
