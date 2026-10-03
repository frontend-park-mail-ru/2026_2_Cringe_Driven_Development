import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // BACKEND_URL — адрес локального бэкенда
    const { BACKEND_URL } = loadEnv(mode, '.', '');

    return {
        server: {
            host: '127.0.0.1',
            strictPort: true,
            proxy: {
                '/api/v1': BACKEND_URL || 'http://127.0.0.1:8080',
            },
        },
        build: { outDir: 'dist', sourcemap: true },
    };
});
