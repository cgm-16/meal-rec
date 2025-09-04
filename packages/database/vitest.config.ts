// ABOUTME: Vitest configuration for the database package
// ABOUTME: Sets up Node.js testing environment for database tests

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: './src/test-global-setup.ts',
    env: {
      // Load .env from monorepo root
      dotenv: resolve(__dirname, '../../.env'),
    },
  },
});