import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from './base.js';

export default tseslint.config(...base, {
  languageOptions: { globals: globals.node },
  rules: {
    // Classes do NestJS injetadas via construtor são referenciadas só por tipo.
    '@typescript-eslint/consistent-type-imports': 'off',
  },
});
