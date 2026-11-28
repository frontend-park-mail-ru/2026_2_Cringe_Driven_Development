import { describe, expect, test } from 'bun:test';
import { rolloutChoices, rolloutHint } from './rules';

const stages = [0, 10, 25, 50, 100];
const at = '2030-01-01T12:01:00Z';

describe('регламент раскатки флага', () => {
    test('выбор: ступени ниже, сохранённый процент и только следующий шаг', () => {
        expect(rolloutChoices(10, { stages, next_percent: 25, next_allowed_at: at })).toEqual([
            0, 10, 25,
        ]);
        // нестандартный старый процент показывается как есть
        expect(rolloutChoices(23, { stages, next_percent: 25, next_allowed_at: at })).toEqual([
            0, 10, 23, 25,
        ]);
        // выключенный флаг и 100% не предлагают повышения
        expect(rolloutChoices(50, { stages, next_percent: null, next_allowed_at: null })).toEqual([
            0, 10, 25, 50,
        ]);
        expect(rolloutChoices(0, { stages, next_percent: 10, next_allowed_at: null })).toEqual([
            0, 10,
        ]);
    });

    test('до времени выдержки шаг недоступен, ровно в срок — доступен', () => {
        const policy = { stages, next_percent: 25, next_allowed_at: at };
        expect(rolloutHint(true, 10, policy, Date.parse(at) - 1).waiting).toBe(true);
        expect(rolloutHint(true, 10, policy, Date.parse(at))).toEqual({
            text: 'Следующий шаг — 25%. Повышение только вручную.',
            waiting: false,
        });
    });

    test('выключенный флаг и 100% объясняют, почему шага нет', () => {
        const none = { stages, next_percent: null, next_allowed_at: null };
        expect(rolloutHint(false, 10, none, 0).text).toContain('включите флаг');
        expect(rolloutHint(true, 100, none, 0).text).toBe('Флаг раскатан на всех.');
    });
});
