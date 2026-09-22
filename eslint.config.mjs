// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

/**
 * Flat ESLint config, mirroring the fleet's standalone-package configs
 * (merge-safety / repo-hygiene). The code-style rules are promoted from AGENTS.md
 * prose to static enforcement so they hold at every model tier.
 */

const tsParserOptions = { sourceType: 'module', ecmaVersion: 2023 };

const STYLE_RULES = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/ban-ts-comment': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-import-type-side-effects': 'error',
  '@typescript-eslint/no-inferrable-types': 'error',
};

const RESTRICTED_SYNTAX = [
  {
    selector: "CallExpression[callee.property.name='then']",
    message: 'Prefer async/await over .then() chains (AGENTS.md).',
  },
  {
    selector: 'CallExpression[callee.type=/FunctionExpression|ArrowFunctionExpression/]',
    message:
      'No IIFEs — extract a named helper or compute the value with a plain expression (AGENTS.md).',
  },
  {
    selector: 'ExportDefaultDeclaration',
    message: 'Named exports only — no default exports (AGENTS.md).',
  },
];

const TEST_RESTRICTED_SYNTAX = [
  ...RESTRICTED_SYNTAX,
  {
    selector: "CallExpression[callee.name='test']",
    message: 'Use it() from Vitest, not test() (AGENTS.md).',
  },
];

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/*.config.*'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsparser, parserOptions: tsParserOptions },
    plugins: { '@typescript-eslint': tseslint, import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: ['tsconfig.json'] },
        node: true,
      },
    },
    rules: {
      'max-lines': ['error', { max: 480, skipBlankLines: false, skipComments: false }],
      'import/no-cycle': ['error', { maxDepth: 1 }],
      ...STYLE_RULES,
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
    },
  },
  {
    files: ['test/**/*.ts', '**/*.test.ts'],
    languageOptions: { parser: tsparser, parserOptions: tsParserOptions },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'max-lines': ['error', { max: 720 }],
      ...STYLE_RULES,
      'no-restricted-syntax': ['error', ...TEST_RESTRICTED_SYNTAX],
    },
  },
];
