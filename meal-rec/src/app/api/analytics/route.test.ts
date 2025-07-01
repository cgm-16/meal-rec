// ABOUTME: Unit tests for analytics API endpoint with aggregation pipeline testing
// ABOUTME: Tests top liked/disliked meals and flavor tags aggregation with mocked database

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  Feedback: {
    aggregate: vi.fn()
  }
}));

import { connect, Feedback } from '@meal-rec/database';

const mockTopLikedMeals = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Pasta Carbonara',
    cuisine: 'Italian',
    imageUrl: 'https://picsum.photos/400/300?random=8',
    flavorTags: ['creamy', 'savory'],
    likeCount: 15
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Chicken Tikka Masala',
    cuisine: 'Indian',
    imageUrl: 'https://picsum.photos/400/300?random=9',
    flavorTags: ['spicy', 'aromatic'],
    likeCount: 12
  }
];

const mockTopDislikedMeals = [
  {
    _id: '507f1f77bcf86cd799439013',
    name: 'Brussels Sprouts Salad',
    cuisine: 'American',
    imageUrl: 'https://picsum.photos/400/300?random=10',
    flavorTags: ['bitter', 'healthy'],
    dislikeCount: 8
  }
];

const mockTopFlavorTags = [
  { tag: 'spicy', count: 25 },
  { tag: 'creamy', count: 20 },
  { tag: 'sweet', count: 18 }
];

describe('/api/analytics GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should connect to database', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    expect(connect).toHaveBeenCalledOnce();
  });

  it('should return analytics data with all three categories', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      topLikedMeals: mockTopLikedMeals,
      topDislikedMeals: mockTopDislikedMeals,
      topFlavorTags: mockTopFlavorTags
    });
  });

  it('should call aggregation pipelines for top liked meals', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    // Check that the first aggregate call is for liked meals
    const firstCall = vi.mocked(Feedback.aggregate).mock.calls[0][0];
    expect(firstCall[0]).toEqual({ $match: { type: 'like' } });
    expect(firstCall[1]).toEqual({ 
      $group: {
        _id: '$meal',
        likeCount: { $sum: 1 }
      }
    });
    expect(firstCall[2]).toEqual({ $sort: { likeCount: -1 } });
    expect(firstCall[3]).toEqual({ $limit: 10 });
  });

  it('should call aggregation pipelines for top disliked meals', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    // Check that the second aggregate call is for disliked meals
    const secondCall = vi.mocked(Feedback.aggregate).mock.calls[1][0];
    expect(secondCall[0]).toEqual({ $match: { type: 'dislike' } });
    expect(secondCall[1]).toEqual({ 
      $group: {
        _id: '$meal',
        dislikeCount: { $sum: 1 }
      }
    });
    expect(secondCall[2]).toEqual({ $sort: { dislikeCount: -1 } });
    expect(secondCall[3]).toEqual({ $limit: 10 });
  });

  it('should call aggregation pipelines for top flavor tags', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    // Check that the third aggregate call is for flavor tags
    const thirdCall = vi.mocked(Feedback.aggregate).mock.calls[2][0];
    expect(thirdCall[0]).toEqual({ $match: { type: { $in: ['like', 'interested'] } } });
    expect(thirdCall[5]).toEqual({ $sort: { count: -1 } });
    expect(thirdCall[6]).toEqual({ $limit: 10 });
  });

  it('should include lookup stages for meal data in liked meals pipeline', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    const firstCall = vi.mocked(Feedback.aggregate).mock.calls[0][0];
    const lookupStage = firstCall[4];
    expect(lookupStage).toEqual({
      $lookup: {
        from: 'meals',
        localField: '_id',
        foreignField: '_id',
        as: 'mealData'
      }
    });
    expect(firstCall[5]).toEqual({ $unwind: '$mealData' });
  });

  it('should include projection stage for liked meals', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    const firstCall = vi.mocked(Feedback.aggregate).mock.calls[0][0];
    const projectionStage = firstCall[6];
    expect(projectionStage).toEqual({
      $project: {
        name: '$mealData.name',
        cuisine: '$mealData.cuisine',
        imageUrl: '$mealData.imageUrl',
        flavorTags: '$mealData.flavorTags',
        likeCount: 1
      }
    });
  });

  it('should handle empty results gracefully', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = new NextRequest('http://localhost/api/analytics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      topLikedMeals: [],
      topDislikedMeals: [],
      topFlavorTags: []
    });
  });

  it('should handle database connection errors', async () => {
    vi.mocked(connect).mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/analytics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Analytics API error:', expect.any(Error));
  });

  it('should handle aggregation pipeline errors', async () => {
    vi.mocked(Feedback.aggregate)
      .mockRejectedValueOnce(new Error('Aggregation failed'));

    const request = new NextRequest('http://localhost/api/analytics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Analytics API error:', expect.any(Error));
  });

  it('should run all aggregation pipelines in parallel', async () => {
    vi.mocked(Feedback.aggregate)
      .mockResolvedValueOnce(mockTopLikedMeals)
      .mockResolvedValueOnce(mockTopDislikedMeals)
      .mockResolvedValueOnce(mockTopFlavorTags);

    const request = new NextRequest('http://localhost/api/analytics');
    await GET(request);

    // All three aggregate calls should have been made
    expect(Feedback.aggregate).toHaveBeenCalledTimes(3);
  });
});