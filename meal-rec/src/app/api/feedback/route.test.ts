// ABOUTME: Test for POST /api/feedback endpoint
// ABOUTME: Tests feedback storage, validation, and rejection of guest feedback

/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { Feedback, User, Meal } from '@meal-rec/database';

// Mock the auth options import to avoid circular dependencies
vi.mock('@/lib/auth', () => ({
  authOptions: {}
}));

// Mock NextAuth getServerSession
vi.mock('next-auth', () => ({
  getServerSession: vi.fn()
}));

import { getServerSession } from 'next-auth';

describe('/api/feedback', () => {
  let mongoServer: MongoMemoryServer;
  let testUser: { _id: string; username: string; hashedPin: string };
  let testMeal: { _id: string; name: string; cuisine?: string };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGO_URL = mongoUri;
    await mongoose.connect(mongoUri);

    // Create test user and meal
    testUser = await new User({
      username: 'testuser',
      hashedPin: 'hash123'
    }).save();

    testMeal = await new Meal({
      name: 'Test Meal',
      primaryIngredients: ['test'],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    }).save();
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear feedback between tests
    await Feedback.deleteMany({});
    vi.clearAllMocks();
    // Default to no session (guest user)
    vi.mocked(getServerSession).mockResolvedValue(null);
  });

  it('rejects guest feedback with 401 instead of silently discarding it', async () => {
    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mealId: testMeal._id.toString(),
        type: 'like'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Sign in to save feedback');
    expect(await Feedback.countDocuments()).toBe(0);
  });

  it('validates required mealId field', async () => {
    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'like'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('mealId and type are required');
  });

  it('validates required type field', async () => {
    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mealId: '123'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('mealId and type are required');
  });

  it('validates type field values', async () => {
    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mealId: '123',
        type: 'invalid'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('type must be like, interested, or dislike');
  });

  it('accepts all valid feedback types', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: testUser._id.toString() }
    });
    const types = ['like', 'interested', 'dislike'];
    
    for (const type of types) {
      const request = new NextRequest('http://localhost:3000/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mealId: testMeal._id.toString(),
          type
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const feedback = await Feedback.findOne({ user: testUser._id, meal: testMeal._id });
      expect(feedback!.type).toBe(type);
    }
  });

  it('persists feedback for authenticated users', async () => {
    // Mock authenticated session
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: testUser._id.toString() }
    });

    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUser._id.toString()
      },
      body: JSON.stringify({
        mealId: testMeal._id.toString(),
        type: 'like'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);

    // Check that feedback was persisted to database
    const savedFeedback = await Feedback.findOne({
      user: testUser._id,
      meal: testMeal._id
    });

    expect(savedFeedback).toBeTruthy();
    expect(savedFeedback!.type).toBe('like');
    expect(savedFeedback!.timestamp).toBeInstanceOf(Date);
  });

  it('updates existing feedback for authenticated users', async () => {
    // Mock authenticated session
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: testUser._id.toString() }
    });

    // Create initial feedback
    const initialFeedback = new Feedback({
      user: testUser._id,
      meal: testMeal._id,
      type: 'like',
      timestamp: new Date()
    });
    await initialFeedback.save();

    // Update feedback
    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUser._id.toString()
      },
      body: JSON.stringify({
        mealId: testMeal._id.toString(),
        type: 'dislike'
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Check that feedback was updated, not duplicated
    const feedbackCount = await Feedback.countDocuments({
      user: testUser._id,
      meal: testMeal._id
    });
    expect(feedbackCount).toBe(1);

    const updatedFeedback = await Feedback.findOne({
      user: testUser._id,
      meal: testMeal._id
    });
    expect(updatedFeedback!.type).toBe('dislike');
  });

  it('handles database errors gracefully for authenticated users', async () => {
    // Mock authenticated session with invalid user ID to trigger database error
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'invalid-user-id-format' }
    });

    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'invalid-user-id-format'
      },
      body: JSON.stringify({
        mealId: 'invalid-meal-id-format',
        type: 'like'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });

  it('handles both guest and authenticated users in same test run', async () => {
    // Guest feedback - ensure no session
    vi.mocked(getServerSession).mockResolvedValue(null);
    
    const guestRequest = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': 'guest-session'
      },
      body: JSON.stringify({
        mealId: 'guest-meal-id',
        type: 'interested'
      })
    });

    const guestResponse = await POST(guestRequest);
    expect(guestResponse.status).toBe(401);

    // Authenticated user feedback - mock session
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: testUser._id.toString() }
    });
    const authRequest = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUser._id.toString()
      },
      body: JSON.stringify({
        mealId: testMeal._id.toString(),
        type: 'like'
      })
    });

    const authResponse = await POST(authRequest);
    expect(authResponse.status).toBe(200);

    // Verify auth feedback is in database
    const dbFeedback = await Feedback.findOne({
      user: testUser._id,
      meal: testMeal._id
    });
    expect(dbFeedback!.type).toBe('like');
  });

  it('handles malformed JSON gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: 'invalid json'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});