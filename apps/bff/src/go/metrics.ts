import type { Transport } from '@cdd-team/http-client';

const samples = new Map<string, { count: number; seconds: number }>();

/**
 * Измеряет время до ответа upstream и считает исходы по сервису и классу статуса.
 * @param service имя upstream
 * @param transport HTTP-транспорт
 */
export function observeUpstream(
    service: 'identity' | 'workspace' | 'onlineconf',
    transport: Transport,
): Transport {
    return async (path, init) => {
        const start = performance.now();
        let outcome = 'network_error';
        try {
            const response = await transport(path, init);
            outcome = `${Math.floor(response.status / 100)}xx`;
            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'TimeoutError') outcome = 'timeout';
            if (error instanceof Error && error.name === 'AbortError') outcome = 'cancelled';
            throw error;
        } finally {
            const labels = `{service="${service}",outcome="${outcome}"}`;
            const sample = samples.get(labels) ?? { count: 0, seconds: 0 };
            sample.count += 1;
            sample.seconds += (performance.now() - start) / 1000;
            samples.set(labels, sample);
        }
    };
}

/** Метрики upstream-вызовов в текстовом формате Prometheus. */
export function upstreamMetrics(): Response {
    const lines = [
        '# TYPE bff_upstream_requests_total counter',
        ...Array.from(
            samples,
            ([labels, sample]) => `bff_upstream_requests_total${labels} ${sample.count}`,
        ),
        '# TYPE bff_upstream_request_duration_seconds_sum counter',
        ...Array.from(
            samples,
            ([labels, sample]) =>
                `bff_upstream_request_duration_seconds_sum${labels} ${sample.seconds}`,
        ),
    ];
    return new Response(lines.join('\n') + '\n', {
        headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=UTF-8' },
    });
}
