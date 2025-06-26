// ABOUTME: Unit tests for the database connection helper
// ABOUTME: Validates environment variable handling and connection error cases

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { connect, disconnect } from './connect';

describe('Database Connection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw error when MONGO_URL is not set', async () => {
    delete process.env.MONGO_URL;
    
    await expect(connect()).rejects.toThrow('MONGO_URL environment variable is required');
  });

  it('should use MONGO_URL from environment', async () => {
    process.env.MONGO_URL = 'mongodb://localhost:27017/test';
    
    // Mock mongoose to avoid actual connection
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    vi.doMock('mongoose', () => ({
      connect: mockConnect,
      disconnect: vi.fn()
    }));

    const { connect: connectFn } = await import('./connect');
    await connectFn();
    
    expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/test');
  });
});