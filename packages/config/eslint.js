// ABOUTME: Shared ESLint configuration for the meal-rec monorepo
// ABOUTME: Provides consistent linting rules across all packages

module.exports = {
  extends: ['next/core-web-vitals'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
};