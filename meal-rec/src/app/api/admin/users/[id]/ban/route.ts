// ABOUTME: Admin API for user ban/unban operations by user ID
// ABOUTME: Protected endpoints requiring admin role for user moderation

import { NextRequest, NextResponse } from 'next/server';
import { connect, User } from '@meal-rec/database';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    
    const body = await request.json();
    const { banned } = body;
    
    if (typeof banned !== 'boolean') {
      return NextResponse.json(
        { error: 'banned field must be a boolean' },
        { status: 400 }
      );
    }
    
    const user = await User.findByIdAndUpdate(
      params.id,
      { banned },
      { new: true, runValidators: true }
    ).select('-hashedPin');
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Prevent admins from banning themselves
    if (user.role === 'admin' && banned) {
      return NextResponse.json(
        { error: 'Cannot ban admin users' },
        { status: 400 }
      );
    }
    
    const action = banned ? 'banned' : 'unbanned';
    return NextResponse.json({ 
      message: `User ${action} successfully`,
      user 
    });
  } catch (error) {
    console.error('Admin user ban/unban error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}