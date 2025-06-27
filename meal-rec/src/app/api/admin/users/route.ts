// ABOUTME: Admin API for user management - list all users with ban/unban capabilities
// ABOUTME: Protected endpoints requiring admin role for user administration

import { NextResponse } from 'next/server';
import { connect, User } from '@meal-rec/database';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    
    const users = await User.find({})
      .select('-hashedPin') // Don't expose password hashes
      .sort({ createdAt: -1 })
      .limit(100); // Reasonable limit for admin interface
    
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Admin users list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}