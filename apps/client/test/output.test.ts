// Вывод исполнения: одно безопасное представление, порядок PNG → SVG → HTML → текст.
import { expect, test } from 'bun:test';
import { pickOutput } from '@pages/NotebookPage/Output';

test('stream и text/plain — текст как есть, разметка не разбирается', () => {
    const xss = '<img src=x onerror=alert(1)>';
    expect(pickOutput({ output_type: 'stream', name: 'stdout', text: [xss, '\n'] })).toEqual({
        kind: 'text',
        text: `${xss}\n`,
        stream: undefined,
    });
    expect(pickOutput({ output_type: 'stream', name: 'stderr', text: 'warn' })).toMatchObject({
        stream: 'stderr',
    });
    expect(pickOutput({ output_type: 'execute_result', data: { 'text/plain': xss } })).toEqual({
        kind: 'text',
        text: xss,
    });
});

test('ошибка — traceback без ANSI; без traceback — имя и сообщение', () => {
    expect(
        pickOutput({
            output_type: 'error',
            ename: 'NameError',
            evalue: "name 'x' is not defined",
            traceback: ['\u001b[0;31mNameError\u001b[0m', "name 'x' is not defined"],
        }),
    ).toEqual({ kind: 'error', text: "NameError\nname 'x' is not defined" });
    expect(pickOutput({ output_type: 'error', ename: 'E', evalue: 'v', traceback: [] })).toEqual({
        kind: 'error',
        text: 'E: v',
    });
});

test('PNG важнее SVG, SVG важнее HTML: картинка через data URL', () => {
    const data = {
        'image/png': 'iVBO\nRw==',
        'image/svg+xml': '<svg onload="alert(1)"/>',
        'text/html': '<b>x</b>',
        'text/plain': 'x',
    };
    expect(pickOutput({ output_type: 'display_data', data })).toEqual({
        kind: 'image',
        src: 'data:image/png;base64,iVBORw==',
    });
    const { 'image/png': _, ...rest } = data;
    const svg = pickOutput({ output_type: 'display_data', data: rest });
    expect(svg).toEqual({
        kind: 'image',
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg onload="alert(1)"/>')}`,
    });
});

test('HTML — в изолированный iframe; JavaScript без текста — не поддерживается', () => {
    expect(
        pickOutput({
            output_type: 'display_data',
            data: { 'text/html': ['<script>', 'x</script>'] },
        }),
    ).toEqual({ kind: 'html', html: '<script>x</script>' });
    expect(
        pickOutput({
            output_type: 'display_data',
            data: { 'application/javascript': 'alert(1)', 'application/vnd.plotly.v1+json': {} },
        }),
    ).toEqual({
        kind: 'unsupported',
        mimes: ['application/javascript', 'application/vnd.plotly.v1+json'],
    });
});
