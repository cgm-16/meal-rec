// ABOUTME: Tests for the Sentry example API route
// ABOUTME: Ensures the deliberate error route is hidden in production but still throws elsewhere

/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from './route';

describe('/api/sentry-example-api', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 404 in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(GET().status).toBe(404);
  });

  it('throws the example error outside production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(() => GET()).toThrow('This error is raised on the backend called by the example page.');
  });
});
