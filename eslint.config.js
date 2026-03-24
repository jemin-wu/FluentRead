import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        MutationObserver: 'readonly',
        HTMLElement: 'readonly',
        Node: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        IntersectionObserver: 'readonly',
        location: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        navigator: 'readonly',
        getComputedStyle: 'readonly',
        globalThis: 'readonly',
        chrome: 'readonly',
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['node_modules/', '.gstack/', '.output/', '.wxt/', 'docs/'],
  },
);
