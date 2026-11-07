/** Вхождение поиска в тексте одной ячейки; current — активное. */
export interface SourceMark {
    from: number;
    to: number;
    current: boolean;
}

/** Кусок текста: данные исходного отрезка и метка поиска, если кусок внутри вхождения. */
export interface Piece<T> {
    text: string;
    data: T;
    mark: 'match' | 'current' | undefined;
}

/**
 * Режет отрезки текста (токены или текст целиком) по границам вхождений. Склейка кусков равна
 * исходному тексту; вхождение на стыке отрезков даёт несколько кусков.
 * @param segments отрезки подряд
 * @param marks вхождения по возрастанию `from`, без перекрытий
 * @returns куски без пустых
 */
export function splitByMarks<T>(
    segments: readonly { text: string; data: T }[],
    marks: readonly SourceMark[],
): Piece<T>[] {
    const pieces: Piece<T>[] = [];
    let start = 0;
    let next = 0;
    for (const { text, data } of segments) {
        const end = start + text.length;
        let at = start;
        while (at < end) {
            while (next < marks.length && marks[next]!.to <= at) next++;
            const mark = marks[next];
            const inside = mark !== undefined && mark.from <= at;
            const stop = Math.min(end, inside ? mark.to : (mark?.from ?? end));
            pieces.push({
                text: text.slice(at - start, stop - start),
                data,
                mark: inside ? (mark.current ? 'current' : 'match') : undefined,
            });
            at = stop;
        }
        start = end;
    }
    return pieces;
}
