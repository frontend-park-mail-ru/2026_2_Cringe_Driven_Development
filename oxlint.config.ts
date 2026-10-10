import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'jsdoc'],
    // require-jsdoc и check-param-names: в плагине jsdoc самого oxlint этих правил нет
    jsPlugins: ['./lint/jsdoc.js'],
    categories: {
        correctness: 'error',
        suspicious: 'warn',
    },
    ignorePatterns: ['dist/', 'node_modules/', 'src/api/schema.ts'],
    rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react/jsx-key': 'error',
        'react/react-in-jsx-scope': 'off',
        // Экспортируемый код документируется JSDoc (README, «Документация кода»)
        'cdd/require-jsdoc': 'error',
        'cdd/check-param-names': 'error',
        // свойства компонента описаны в интерфейсе его props, в @param — только сам объект
        'jsdoc/require-param': ['error', { checkDestructured: false }],
        'jsdoc/require-param-type': 'error',
        'jsdoc/require-returns': 'error',
        'jsdoc/require-returns-type': 'error',
        // Модули из src/modules импортируются только через их index.ts
        'no-restricted-imports': [
            'error',
            {
                patterns: [
                    {
                        group: ['@modules/*/*', '**/modules/*/*'],
                        message: 'Импортируй модуль через его index.ts: @modules/<имя>',
                    },
                ],
            },
        ],
    },
});
