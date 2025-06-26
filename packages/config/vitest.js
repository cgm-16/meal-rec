// ABOUTME: Shared Vitest configuration for the meal-rec monorepo
// ABOUTME: Provides consistent testing setup for React 18 with jsdom environment

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});