// ABOUTME: Test setup for database connections using global MongoDB instance
// ABOUTME: Manages mongoose connections to the globally-created test database

import mongoose from 'mongoose';

export async function setupTestDb() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in environment. Make sure global setup is configured.');
  }
  await mongoose.connect(mongoUri);
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