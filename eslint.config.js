// @ts-check
/**
 * ESLint flat config. TypeScript-aware rules everywhere; React Hooks and Fast Refresh rules only in
 * `src/client/ui/**`, the one place in the client that is allowed to use React (enforced here as a second
 * layer alongside `tools/check-deps.ts`, which checks it structurally with no extra dependencies).
 */
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Rules-of-hooks and friends do not apply here, but an unused destructure or shadowed name still should flag.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // The codebase intentionally uses `any` nowhere; a stray one should be visible, not silent.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // React only lives in the UI layer; everything else in the client is plain TypeScript and three.js.
    files: ['src/client/ui/**/*.{ts,tsx}', 'src/client/main.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Components, hooks and ports export plenty of non-component values (types, stores) by design.
    },
  },
  {
    // The entry point is never hot-swapped as a component module (it boots createRoot once), so the
    // fast-refresh rule has nothing to protect here.
    files: ['src/client/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['src/client/platform/**/*.ts', 'src/client/render/**/*.ts', 'src/client/game/**/*.ts'],
    rules: {
      // Belt-and-braces on top of `tools/check-deps.ts`: this plain-TypeScript code must never pull in React
      // or the `ui/` folder, so the game stays usable without a UI layer at all.
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'Plain client code (platform/render/game) must not import React; it belongs to ui/.' },
          { group: ['@client/ui/*', '@client/ui'], message: 'Plain client code (platform/render/game) must not import ui/; talk to it through game/ports.ts instead.' },
        ],
      }],
    },
  },
  {
    files: ['tests/**/*.ts', 'tools/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
