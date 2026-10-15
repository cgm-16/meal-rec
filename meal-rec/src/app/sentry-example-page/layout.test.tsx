// ABOUTME: Tests for the Sentry example page layout
// ABOUTME: Ensures the example page is a 404 in production and renders elsewhere

import { describe, it, expect, vi, afterEach } from 'vitest';
import SentryExampleLayout from './layout';

describe('Sentry example page layout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is not found in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => SentryExampleLayout({ children: null })).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('renders its children outside production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(SentryExampleLayout({ children: 'page' })).toBe('page');
  });
});
