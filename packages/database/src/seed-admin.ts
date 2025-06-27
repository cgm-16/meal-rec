// ABOUTME: Admin user seeding script for initial admin account creation
// ABOUTME: Creates admin user from environment variables with proper error handling

import { connect, User } from './index';
import bcrypt from 'bcryptjs';

async function seedAdmin() {
  try {
    await connect();
    
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPin = process.env.ADMIN_PIN;
    
    if (!adminUsername || !adminPin) {
      console.log('Skipping admin seeding: ADMIN_USERNAME and ADMIN_PIN environment variables required');
      process.exit(0);
    }
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: adminUsername });
    if (existingAdmin) {
      console.log(`Admin user '${adminUsername}' already exists`);
      process.exit(0);
    }
    
    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(adminPin)) {
      console.error('Admin PIN must be exactly 4 digits');
      process.exit(1);
    }
    
    // Hash the PIN
    const hashedPin = await bcrypt.hash(adminPin, 12);
    
    // Create admin user
    const adminUser = new User({
      username: adminUsername,
      hashedPin,
      role: 'admin',
      banned: false
    });
    
    await adminUser.save();
    console.log(`Admin user '${adminUsername}' created successfully`);
    process.exit(0);
    
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedAdmin();
}

export { seedAdmin };