// ABOUTME: Admin authentication middleware for role-based access control
// ABOUTME: Validates user session and admin role for protected admin routes

import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth';
import { connect, User } from '@meal-rec/database';
import { NextResponse } from 'next/server';

export async function requireAdmin() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    await connect();
    const user = await User.findById(session.user.id);
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    
    if (user.banned) {
      return NextResponse.json(
        { error: 'Account banned' },
        { status: 403 }
      );
    }
    
    return null; // Success - no error response
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}