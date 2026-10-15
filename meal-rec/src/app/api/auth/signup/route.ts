// ABOUTME: API endpoint for user registration handling username and 4-digit PIN
// ABOUTME: Validates input, hashes the PIN with bcrypt server-side, and creates the user account

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connect, User } from '@meal-rec/database';

interface SignUpRequest {
  username: string;
  pin: string;
}

export async function POST(request: NextRequest) {
  try {
    await connect();

    const body: SignUpRequest = await request.json();
    const { username, pin } = body;

    // Validate input
    if (!username || !pin) {
      return NextResponse.json(
        { error: 'Username and PIN are required' },
        { status: 400 }
      );
    }

    // Non-strings such as { "$ne": null } must never reach a query filter
    if (typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username must be a string' },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      );
    }

    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      );
    }

    // Create new user
    const hashedPin = await bcrypt.hash(pin, 10);
    // Quiz preferences stay client-side in localStorage; nothing reads User.preferences
    const user = new User({
      username,
      hashedPin
    });

    await user.save();

    return NextResponse.json(
      { message: 'User created successfully', userId: user._id },
      { status: 201 }
    );

  } catch (error) {
    console.error('Sign-up error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}