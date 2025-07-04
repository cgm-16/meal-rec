// ABOUTME: Vitest configuration for the database package
// ABOUTME: Sets up Node.js testing environment for database tests

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});