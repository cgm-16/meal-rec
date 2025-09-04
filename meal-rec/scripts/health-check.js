// ABOUTME: Database health check script for E2E test setup
// ABOUTME: Ensures MongoDB is ready before starting Playwright tests

const mongoose = require('mongoose');

async function healthCheck() {
  const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/meal-rec';
  
  console.log('Checking database connection...');
  
  try {
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    
    // Test a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`✓ Database connected successfully (${collections.length} collections found)`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('✗ Database health check failed:', error.message);
    process.exit(1);
  }
}

healthCheck();