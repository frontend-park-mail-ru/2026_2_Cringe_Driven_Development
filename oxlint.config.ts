import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'jsdoc'],
    /** `require-jsdoc` и `check-param-names`: в плагине jsdoc самого oxlint этих правил нет */
    jsPlugins: ['@cdd-team/oxlint-plugin-jsdoc'],
    categories: {
        correctness: 'error',
        suspicious: 'warn',
    },
    ignorePatterns: [
        '**/dist/',
        'node_modules/',
        // сгенерированное: bun run sync
        'apps/bff/src/go/client.ts',
        'packages/schemas/src/zod.ts',
    ],
    rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react/jsx-key': 'error',
        'react/react-in-jsx-scope': 'off',
        /** Экспорт документируется JSDoc (docs/local-development.md, «Документация кода») */
        'cdd/require-jsdoc': 'error',
        'cdd/check-param-names': 'error',
    },
});
