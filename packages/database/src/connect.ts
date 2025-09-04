// ABOUTME: Database connection helper for MongoDB using Mongoose
// ABOUTME: Provides a reusable connection function that reads from MONGO_URL environment variable

import mongoose from 'mongoose';

export async function connect(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL;
  
  if (!mongoUrl) {
    throw new Error('MONGO_URL environment variable is required');
  }

  try {
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 5000, // How long to try selecting a server
      connectTimeoutMS: 10000, // How long to wait for initial connection
      socketTimeoutMS: 45000, // How long to wait for socket operations
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 5, // Minimum number of connections in the pool
    });
    console.log(`Connected to MongoDB at ${mongoUrl.replace(/\/\/.*@/, '//***@')}`);
  } catch (error) {
    const sanitizedUrl = mongoUrl.replace(/\/\/.*@/, '//***@');
    console.error(`MongoDB connection failed for ${sanitizedUrl}:`, {
      name: error.name,
      message: error.message,
      code: error.code,
    });
    
    // Provide more helpful error messages
    if (error.name === 'MongooseServerSelectionError') {
      console.error('Possible causes: MongoDB server not running, incorrect connection string, or network issues');
    } else if (error.name === 'MongooseTimeoutError') {
      console.error('Connection timed out - check if MongoDB is accessible and responsive');
    }
    
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}