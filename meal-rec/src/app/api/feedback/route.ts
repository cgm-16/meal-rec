// ABOUTME: API route for POST /api/feedback to handle user meal preferences
// ABOUTME: Stores feedback in memory for guests, persists to database for authenticated users

import { NextRequest, NextResponse } from 'next/server';
import { connect, Feedback } from '@meal-rec/database';

// In-memory storage for guest feedback (TTL 2 hours as per prompt requirement)
interface FeedbackEntry {
  mealId: string;
  type: 'like' | 'interested' | 'dislike';
  timestamp: number;
}

const guestFeedback = new Map<string, { timestamp: number, feedback: FeedbackEntry[] }>();

// Clean up expired feedback (older than 2 hours)
const FEEDBACK_TTL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

function cleanupExpiredFeedback() {
  const now = Date.now();
  for (const [sessionId, data] of guestFeedback.entries()) {
    if (now - data.timestamp > FEEDBACK_TTL) {
      guestFeedback.delete(sessionId);
    }
  }
}

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

    // Check for authenticated user (for now, check x-user-id header)
    // In future prompts, this will be replaced with proper session/auth
    const userId = request.headers.get('x-user-id');

    if (userId) {
      // Authenticated user: persist to database
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
    } else {
      // Guest user: store in memory with TTL
      cleanupExpiredFeedback();
      
      const sessionId = request.headers.get('x-session-id') || 'guest';
      
      const feedbackEntry = {
        mealId,
        type,
        timestamp: Date.now(),
      };

      if (!guestFeedback.has(sessionId)) {
        guestFeedback.set(sessionId, {
          timestamp: Date.now(),
          feedback: []
        });
      }

      const sessionData = guestFeedback.get(sessionId)!;
      sessionData.feedback.push(feedbackEntry);
      sessionData.timestamp = Date.now(); // Update session timestamp
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

