import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,

  {
    ignores: ['node_modules/**', 'dist/**', 'data/**', 'coverage/**']
  },

  {
    plugins: {
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSort
    },

    rules: {
      'prettier/prettier': 'error',

      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^(req|res|next|val|_.*)$' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'valid-typeof': 'warn',
      'no-useless-escape': 'warn',
      'prefer-destructuring': ['warn', { object: true, array: false }],

      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^@macolmenerori?\\w'],
            ['^@?\\w'],
            ['^\\u0000'],
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$']
          ]
        }
      ]
    }
  },

  prettierConfig
);
