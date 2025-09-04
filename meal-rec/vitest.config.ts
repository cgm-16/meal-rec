// ABOUTME: Vitest configuration for the meal-rec Next.js application
// ABOUTME: Sets up React 18 testing environment with jsdom and path aliases

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      // Load .env from monorepo root
      dotenv: path.resolve(__dirname, '../.env'),
    },
    // Use pool 'forks' for better isolation between different test types
    pool: 'forks',
    // Exclude Playwright tests from vitest
    exclude: ['**/tests/**', '**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@meal-rec/database': path.resolve(__dirname, '../packages/database/src'),
    },
  },
});