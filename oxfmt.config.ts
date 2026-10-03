import { defineConfig } from 'oxfmt';

export default defineConfig({
    singleQuote: true,
    printWidth: 100,
    endOfLine: 'lf',
    tabWidth: 4,
    ignorePatterns: ['.github/**', 'README.md', 'dist/**', 'spec/**', 'src/api/schema.ts'],
});
