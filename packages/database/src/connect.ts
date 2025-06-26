// ABOUTME: Database connection helper for MongoDB using Mongoose
// ABOUTME: Provides a reusable connection function that reads from MONGO_URL environment variable

import mongoose from 'mongoose';

export async function connect(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL;
  
  if (!mongoUrl) {
    throw new Error('MONGO_URL environment variable is required');
  }

  try {
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}