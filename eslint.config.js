import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // La Edge Function de supabase/ corre en Deno, con su propio runtime y linter.
  globalIgnores(['dist', 'supabase']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Las dos reglas clásicas de los hooks; las del React Compiler no se activan.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `{ id: _id, ...resto }` omite campos a propósito: lo que se usa es el resto.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Tipado laxo: avisa sin bloquear; la barrera es TypeScript en modo estricto.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
]);
