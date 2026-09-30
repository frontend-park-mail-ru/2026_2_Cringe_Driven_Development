import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'react-hooks', 'jsx-a11y'],
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
    },
});
