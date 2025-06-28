// ABOUTME: Unit tests for admin meals API endpoints with role-based access control
// ABOUTME: Tests meal CRUD operations and admin authentication requirements

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  Meal: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue({})
  }))
}));

// Add static methods to Meal mock
const MockMeal = vi.mocked(Meal);
MockMeal.find = vi.fn();

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn()
}));

import { connect, Meal } from '@meal-rec/database';
import { requireAdmin } from '@/lib/admin-auth';

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
    createdAt: '2025-06-27T16:13:27.258Z'
  }
];

describe('/api/admin/meals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET', () => {
    it('should require admin authentication', async () => {
      const mockAuthError = new Response('Unauthorized', { status: 401 });
      vi.mocked(requireAdmin).mockResolvedValue(mockAuthError);

      const response = await GET();
      
      expect(requireAdmin).toHaveBeenCalledOnce();
      expect(response.status).toBe(401);
    });

    it('should return meals list for admin user', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      
      const mockFind = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockMeals)
      };
      MockMeal.find.mockReturnValue(mockFind as ReturnType<typeof MockMeal.find>);

      const response = await GET();
      const data = await response.json();

      expect(connect).toHaveBeenCalledOnce();
      expect(MockMeal.find).toHaveBeenCalledWith({});
      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockFind.limit).toHaveBeenCalledWith(100);
      expect(response.status).toBe(200);
      expect(data).toEqual({ meals: mockMeals });
    });

    it('should handle database errors', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      vi.mocked(connect).mockRejectedValue(new Error('Database error'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalledWith('Admin meals list error:', expect.any(Error));
    });
  });

  describe('POST', () => {
    it('should require admin authentication', async () => {
      const mockAuthError = new Response('Unauthorized', { status: 401 });
      vi.mocked(requireAdmin).mockResolvedValue(mockAuthError);

      const request = new NextRequest('http://localhost/api/admin/meals', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Meal', primaryIngredients: ['test'] })
      });

      const response = await POST(request);
      
      expect(requireAdmin).toHaveBeenCalledOnce();
      expect(response.status).toBe(401);
    });

    it('should create a new meal with valid data', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      
      const mockMeal = {
        _id: 'new-meal-id',
        name: 'Test Meal',
        primaryIngredients: ['test ingredient'],
        spiciness: 3,
        save: vi.fn().mockResolvedValue({
          _id: 'new-meal-id',
          name: 'Test Meal',
          primaryIngredients: ['test ingredient'],
          spiciness: 3
        })
      };
      
      // Mock constructor to return our mock meal
      MockMeal.mockImplementation(() => mockMeal);

      const request = new NextRequest('http://localhost/api/admin/meals', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Meal',
          cuisine: 'Test',
          primaryIngredients: ['test ingredient'],
          spiciness: 3,
          heaviness: 2
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(connect).toHaveBeenCalledOnce();
      expect(mockMeal.save).toHaveBeenCalledOnce();
      expect(response.status).toBe(201);
      expect(data.meal.name).toBe('Test Meal');
    });

    it('should validate required fields', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/meals', {
        method: 'POST',
        body: JSON.stringify({}) // Missing required fields
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name and primaryIngredients are required');
    });

    it('should validate spiciness range', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/meals', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Meal',
          primaryIngredients: ['test'],
          spiciness: 10 // Invalid range
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Spiciness must be between 0 and 5');
    });

    it('should validate heaviness range', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/meals', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Meal',
          primaryIngredients: ['test'],
          heaviness: -1 // Invalid range
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Heaviness must be between 0 and 5');
    });

    it('should handle database errors during creation', async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      vi.mocked(connect).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/admin/meals', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Meal',
          primaryIngredients: ['test']
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalledWith('Admin meal creation error:', expect.any(Error));
    });
  });
});