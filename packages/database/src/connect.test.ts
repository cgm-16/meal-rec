// ABOUTME: Unit tests for the database connection helper
// ABOUTME: Validates environment variable handling and connection error cases

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { connect } from './connect';

vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn()
  }
}));

describe('Database Connection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
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
    
    const mongoose = await import('mongoose');
    await connect();
    
    expect(mongoose.default.connect).toHaveBeenCalledWith('mongodb://localhost:27017/test', {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 5,
    });
  });
});