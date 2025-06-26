// ABOUTME: Test for GET /api/meals pagination endpoint
// ABOUTME: Tests pagination, error handling, and meal retrieval using in-memory MongoDB

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Meal } from '@meal-rec/database';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('/api/meals', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGO_URL = mongoUri;
    await mongoose.connect(mongoUri);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Meal.deleteMany({});
  });

  it('should return paginated meals with default pagination', async () => {
    // Create test meals
    const testMeals = Array.from({ length: 15 }, (_, i) => ({
      name: `Test Meal ${i + 1}`,
      primaryIngredients: ['test'],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    }));
    await Meal.insertMany(testMeals);

    const request = new NextRequest('http://localhost:3000/api/meals');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meals).toHaveLength(10); // default limit
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(10);
    expect(data.pagination.total).toBe(15);
    expect(data.pagination.totalPages).toBe(2);
    expect(data.pagination.hasNext).toBe(true);
    expect(data.pagination.hasPrev).toBe(false);
  });

  it('should return paginated meals with custom pagination', async () => {
    // Create test meals
    const testMeals = Array.from({ length: 15 }, (_, i) => ({
      name: `Test Meal ${i + 1}`,
      primaryIngredients: ['test'],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    }));
    await Meal.insertMany(testMeals);

    const request = new NextRequest('http://localhost:3000/api/meals?page=2&limit=5');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meals).toHaveLength(5);
    expect(data.pagination.page).toBe(2);
    expect(data.pagination.limit).toBe(5);
    expect(data.pagination.total).toBe(15);
    expect(data.pagination.totalPages).toBe(3);
    expect(data.pagination.hasNext).toBe(true);
    expect(data.pagination.hasPrev).toBe(true);
  });

  it('should return empty array when no meals exist', async () => {
    const request = new NextRequest('http://localhost:3000/api/meals');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meals).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });

  it('should return 400 for invalid pagination parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/meals?page=0&limit=101');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid pagination parameters');
  });
});