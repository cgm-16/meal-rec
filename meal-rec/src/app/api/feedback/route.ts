// ABOUTME: API route for POST /api/feedback to handle user meal preferences
// ABOUTME: Stores feedback in memory for guests, will persist for authenticated users later

import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for guest feedback (TTL 2 hours as per prompt requirement)
const guestFeedback = new Map<string, { timestamp: number, feedback: any[] }>();

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

    // Clean up expired feedback
    cleanupExpiredFeedback();

    // For now, handle as guest feedback (no session/auth yet)
    // In future prompts, this will check for authenticated users
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

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Error processing feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export function to get guest feedback (for testing)
export function getGuestFeedback(sessionId: string = 'guest') {
  cleanupExpiredFeedback();
  return guestFeedback.get(sessionId)?.feedback || [];
}