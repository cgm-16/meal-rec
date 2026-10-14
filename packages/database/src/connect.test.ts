// ABOUTME: Unit tests for the database connection helper
// ABOUTME: Validates environment variable handling and connection error cases

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { connect } from './connect';

vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    connection: { readyState: 0 }
  },
  MongooseError: class MongooseError extends Error {}
}));

import mongoose from 'mongoose';

describe('Database Connection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    mongoose.connection.readyState = 0;
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
    });
  });

  it('should not reconnect when a connection is already open', async () => {
    process.env.MONGO_URL = 'mongodb://localhost:27017/test';
    mongoose.connection.readyState = 1;

    await connect();

    expect(mongoose.connect).not.toHaveBeenCalled();
  });

  it('should share one connection attempt between concurrent callers', async () => {
    process.env.MONGO_URL = 'mongodb://localhost:27017/test';

    await Promise.all([connect(), connect(), connect()]);

    expect(mongoose.connect).toHaveBeenCalledOnce();
  });

  it('should retry on the next call after a failed connection attempt', async () => {
    process.env.MONGO_URL = 'mongodb://localhost:27017/test';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(mongoose.connect).mockRejectedValueOnce(new Error('unreachable'));

    await expect(connect()).rejects.toThrow('Database connection failed: unreachable');
    await connect();

    expect(mongoose.connect).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('MongoDB connection failed'), expect.anything());
    consoleError.mockRestore();
  });
});