import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

const config = [
  ...nextVitals,
  prettierConfig,
  {
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      react: react,
      prettier: prettierPlugin
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],

      // Import management
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'import/no-duplicates': 'error',

      // Code quality
      'no-console': [
        'warn',
        {
          allow: ['error', 'warn', 'info']
        }
      ],

      // React rules
      'react/jsx-key': 'error',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off'
    }
  },
  {
    // Design system guardrails (see DESIGN.md): style with Panda tokens and the
    // components in src/components/ui, never ad-hoc values.
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx', 'src/lib/**/*.tsx'],
    ignores: ['src/components/ui/**', 'src/app/api/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression",
          message: 'Use Panda css()/recipes or a ui component instead of inline style objects (DESIGN.md).'
        },
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Use a colour token (colors.*) instead of a hex literal (DESIGN.md).'
        }
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['*.module.css'], message: 'CSS modules are retired; use Panda (DESIGN.md).' }] }
      ]
    }
  },
  {
    ignores: ['styled-system/**']
  }
];

export default config;
