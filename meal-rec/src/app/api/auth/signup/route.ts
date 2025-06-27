// ABOUTME: API endpoint for user registration handling username and hashed PIN
// ABOUTME: Creates new user accounts and validates input data before database storage

import { NextRequest, NextResponse } from 'next/server';
import { connect, User } from '@meal-rec/database';

interface SignUpRequest {
  username: string;
  hashedPin: string;
}

export async function POST(request: NextRequest) {
  try {
    await connect();

    const body: SignUpRequest = await request.json();
    const { username, hashedPin } = body;

    // Validate input
    if (!username || !hashedPin) {
      return NextResponse.json(
        { error: 'Username and PIN are required' },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
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
    const user = new User({
      username,
      hashedPin,
      preferences: {
        dietaryRestrictions: [],
        preferredCuisines: [],
        spiceLevel: 2
      }
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