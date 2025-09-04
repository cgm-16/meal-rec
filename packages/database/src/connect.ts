// ABOUTME: Database connection helper for MongoDB using Mongoose
// ABOUTME: Provides a reusable connection function that reads from MONGO_URL environment variable

import mongoose, { MongooseError } from 'mongoose';

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
    
    // Type guard for Error objects with proper typing
    let errorInfo: { name: string; message: string; code?: string | number };
    
    if (error instanceof MongooseError) {
      errorInfo = { 
        name: error.name, 
        message: error.message, 
        code: 'code' in error ? (error as { code: string | number }).code : undefined 
      };
    } else if (error instanceof Error) {
      errorInfo = { name: error.name, message: error.message };
    } else {
      errorInfo = { name: 'Unknown', message: String(error) };
    }
    
    console.error(`MongoDB connection failed for ${sanitizedUrl}:`, errorInfo);
    
    // Provide more helpful error messages
    if (errorInfo.name === 'MongooseServerSelectionError') {
      console.error('Possible causes: MongoDB server not running, incorrect connection string, or network issues');
    } else if (errorInfo.name === 'MongooseTimeoutError') {
      console.error('Connection timed out - check if MongoDB is accessible and responsive');
    }
    
    throw new Error(`Database connection failed: ${errorInfo.message}`);
  }
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}