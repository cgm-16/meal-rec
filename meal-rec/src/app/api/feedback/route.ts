// ABOUTME: API route for POST /api/feedback to handle user meal preferences
// ABOUTME: Persists feedback for signed-in users; guests get 401 since nothing would read their feedback

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connect, Feedback } from '@meal-rec/database';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mealId, type } = body;

    // Validate request body
    if (!mealId || !type) {
      return NextResponse.json(
        { error: 'mealId and type are required' },
        { status: 400 }
      );
    }

    if (!['like', 'interested', 'dislike'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be like, interested, or dislike' },
        { status: 400 }
      );
    }

    // Check for authenticated user using NextAuth session
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'Sign in to save feedback' },
        { status: 401 }
      );
    }

    await connect();
      
    // Check if feedback already exists for this user/meal combination
    const existingFeedback = await Feedback.findOne({ 
      user: userId, 
      meal: mealId 
    });

    if (existingFeedback) {
      // Update existing feedback
      existingFeedback.type = type;
      existingFeedback.timestamp = new Date();
      await existingFeedback.save();
    } else {
      // Create new feedback
      const feedback = new Feedback({
        user: userId,
        meal: mealId,
        type,
        timestamp: new Date()
      });
      await feedback.save();
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Error processing feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

