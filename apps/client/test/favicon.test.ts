import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

// Googlebot-Image не ходит на CDN (robots.txt запрещает всё): favicon должен быть на origin
test('prod-сборка с CDN: иконки — по постоянному адресу на origin, JS — с CDN', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'client-'));
    process.env.CDN_URL = 'cdn.example.com';
    process.env.RELEASE_SHA = 'abc123';
    try {
        await build({
            root: join(import.meta.dir, '..'),
            configFile: join(import.meta.dir, '../vite.config.prod.ts'),
            logLevel: 'silent',
            build: { outDir, emptyOutDir: true },
        });
        const html = await Bun.file(join(outDir, 'index.html')).text();
        const icons = html.match(/<link rel="(icon|apple-touch-icon)"[^>]*>/g);
        expect(icons).toEqual([
            '<link rel="icon" type="image/png" sizes="180x180" href="/apple-touch-icon.png" />',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
        ]);
        expect(html).toContain('src="https://cdn.example.com/releases/abc123/assets/');
    } finally {
        delete process.env.CDN_URL;
        delete process.env.RELEASE_SHA;
        await rm(outDir, { recursive: true });
    }
}, 60_000);
