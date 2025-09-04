// ABOUTME: Database health check script for E2E test setup
// ABOUTME: Ensures MongoDB is ready before starting Playwright tests

const mongoose = require('mongoose');

async function healthCheck() {
  const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/meal-rec-e2e-test';
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  console.log('Checking database connection...');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}: Connecting to ${mongoUrl.replace(/:[^@]*@/, ':***@')}`);
      
      await mongoose.connect(mongoUrl, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 5,
        minPoolSize: 1,
      });
      
      // Test a simple query with timeout
      const adminDb = mongoose.connection.db.admin();
      const result = await Promise.race([
        adminDb.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 5000))
      ]);
      
      console.log(`✓ Database connected successfully (ping result: ${JSON.stringify(result)})`);
      
      await mongoose.disconnect();
      console.log('✓ Health check completed successfully');
      process.exit(0);
      
    } catch (error) {
      console.error(`✗ Attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error('✗ All health check attempts failed');
        console.error('✗ This may indicate MongoDB is not running or not accessible');
        console.error('✗ For E2E tests, ensure MongoDB is running on the expected port');
        process.exit(1);
      }
      
      if (attempt < maxRetries) {
        console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
}

healthCheck();