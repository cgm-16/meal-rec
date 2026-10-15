// ABOUTME: Test setup for database connections using global MongoDB instance
// ABOUTME: Manages mongoose connections to the globally-created test database

import { inject } from 'vitest';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

export async function setupTestDb() {
  const mongoUri = inject('MONGO_URI');
  if (!mongoUri) {
    throw new Error('MONGO_URI not found in test context. Make sure global setup is configured.');
  }
  // Test files run in parallel against one server; a database per file keeps
  // one file's clearTestDb() from deleting another file's fixtures
  await mongoose.connect(mongoUri, { dbName: `test-${randomUUID()}` });
  // Unique-constraint tests need indexes built before they insert
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
}

export async function teardownTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export async function clearTestDb() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}