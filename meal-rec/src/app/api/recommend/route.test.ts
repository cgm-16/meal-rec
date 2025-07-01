// ABOUTME: Contract tests for the /api/recommend endpoint with database and weather utility mocks
// ABOUTME: Validates integration between quiz answers, user feedback, weather data, and recommendation engine

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  Meal: {
    aggregate: vi.fn()
  },
  getRecentFeedback: vi.fn()
}));

vi.mock('@meal-rec/core', () => ({
  selectRecommendation: vi.fn()
}));

import { connect, Meal, getRecentFeedback } from '@meal-rec/database';
import { selectRecommendation } from '@meal-rec/core';

const mockMeals = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Pasta Carbonara',
    cuisine: 'Italian',
    primaryIngredients: ['pasta', 'eggs', 'cheese'],
    allergens: ['eggs', 'dairy'],
    weather: ['cold'],
    timeOfDay: ['dinner'],
    spiciness: 1,
    heaviness: 4,
    flavorTags: ['creamy', 'savory'],
    imageUrl: 'https://picsum.photos/400/300?random=5',
    description: 'Classic Italian pasta dish'
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Spicy Thai Curry',
    cuisine: 'Thai',
    primaryIngredients: ['chicken', 'coconut milk', 'curry paste'],
    allergens: [],
    weather: ['cold', 'rain'],
    timeOfDay: ['lunch', 'dinner'],
    spiciness: 4,
    heaviness: 3,
    flavorTags: ['spicy', 'aromatic'],
    imageUrl: 'https://picsum.photos/400/300?random=6',
    description: 'Authentic Thai curry with coconut milk'
  }
];

const mockFeedbackData = [
  {
    _id: '507f1f77bcf86cd799439021',
    user: 'user123',
    meal: {
      _id: '507f1f77bcf86cd799439011',
      flavorTags: ['creamy', 'savory']
    },
    type: 'like',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
  }
];

describe('/api/recommend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Meal.aggregate).mockResolvedValue(mockMeals);
    vi.mocked(getRecentFeedback).mockResolvedValue(mockFeedbackData);
    vi.mocked(selectRecommendation).mockReturnValue(mockMeals[0]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should connect to database', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    await POST(request);

    expect(connect).toHaveBeenCalledOnce();
  });

  it('should use default quiz answers when none provided', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    await POST(request);

    expect(selectRecommendation).toHaveBeenCalledWith({
      quiz: {
        ingredientsToAvoid: [],
        spiciness: 2,
        surpriseFactor: 5
      },
      recentFeedback: [],
      weather: 'normal',
      candidateMeals: mockMeals
    });
  });

  it('should use provided quiz answers and weather', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({
        quiz: {
          ingredientsToAvoid: ['nuts'],
          spiciness: 3,
          surpriseFactor: 8
        },
        weather: 'cold'
      })
    });

    await POST(request);

    expect(selectRecommendation).toHaveBeenCalledWith({
      quiz: {
        ingredientsToAvoid: ['nuts'],
        spiciness: 3,
        surpriseFactor: 8
      },
      recentFeedback: [],
      weather: 'cold',
      candidateMeals: mockMeals
    });
  });

  it('should fetch recent user feedback when user is authenticated', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      headers: {
        'x-user-id': 'user123'
      },
      body: JSON.stringify({})
    });

    await POST(request);

    expect(getRecentFeedback).toHaveBeenCalledWith('user123', 14);

    expect(selectRecommendation).toHaveBeenCalledWith({
      quiz: expect.any(Object),
      recentFeedback: [{
        mealId: '507f1f77bcf86cd799439011',
        type: 'like',
        timestamp: expect.any(Date)
      }],
      weather: 'normal',
      candidateMeals: mockMeals
    });
  });

  it('should query 50 random candidate meals from database', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    await POST(request);

    expect(Meal.aggregate).toHaveBeenCalledWith([
      { $sample: { size: 50 } }
    ]);
  });

  it('should return selected meal from recommendation engine', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockMeals[0]);
  });

  it('should return 404 when no meals available', async () => {
    vi.mocked(Meal.aggregate).mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'No meals available' });
  });

  it('should return 404 when recommendation engine returns null', async () => {
    vi.mocked(selectRecommendation).mockReturnValue(null);

    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'No suitable meal found' });
  });

  it('should handle database connection errors', async () => {
    vi.mocked(connect).mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });

  it('should handle malformed JSON requests', async () => {
    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: '{ invalid json'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });

  it('should handle recommendation engine errors', async () => {
    vi.mocked(selectRecommendation).mockImplementation(() => {
      throw new Error('Recommendation engine failed');
    });

    const request = new NextRequest('http://localhost/api/recommend', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});