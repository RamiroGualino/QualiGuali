const sharedConfig = require('./packages/shared/eslint-config');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  ...sharedConfig,
  // apps/web is a browser/ESM React app — overrides the CommonJS/Node
  // defaults from the shared backend config for its files specifically.
  {
    files: ['apps/web/**/*.{js,jsx}'],
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // new JSX transform, no `import React` needed
      'react/prop-types': 'off', // plain JS project, no prop-types library
    },
  },
  {
    files: ['apps/web/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
  {
    files: ['apps/web/tests/**/*.{js,jsx}', 'apps/web/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.jest },
    },
  },
  {
    files: ['apps/web/e2e/**/*.js', 'apps/web/playwright.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    ignores: ['apps/web/dist/**'],
  },
];
