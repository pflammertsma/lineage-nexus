import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Build config runs in Node, not the browser.
    files: ['vite.config.js', 'postcss.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ignoreRestSiblings lets components strip a prop before spreading the rest onto a DOM
      // element (e.g. react-markdown's `node`), which would otherwise warn at runtime.
      //
      // argsIgnorePattern also allows Capitalised args. This config has no
      // jsx-uses-vars rule (eslint-plugin-react is not installed), so a component
      // passed in and rendered only as <Icon /> reads as unused. By React
      // convention a capitalised identifier *is* a component, so exempting them
      // avoids rewriting working code to satisfy a blind spot in the linter.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^(_|[A-Z])', ignoreRestSiblings: true },
      ],
    },
  },
])
