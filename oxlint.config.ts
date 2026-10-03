import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y'],
    categories: {
        correctness: 'error',
        suspicious: 'warn',
    },
    ignorePatterns: ['dist/', 'node_modules/'],
    rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react/jsx-key': 'error',
        'react/react-in-jsx-scope': 'off',
        // Модули из src/modules импортируются только через их index.ts
        'no-restricted-imports': [
            'error',
            {
                patterns: [
                    {
                        group: ['**/modules/*/*'],
                        message: 'Импортируй модуль через его index.ts: ./modules/<имя>',
                    },
                ],
            },
        ],
    },
});
