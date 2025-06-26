// ABOUTME: Test for GET /api/meals/random endpoint
// ABOUTME: Tests random meal selection and error handling using in-memory MongoDB

/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Meal } from '@meal-rec/database';
import { GET } from './route';

describe('/api/meals/random', () => {
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

  it('should return a random meal when meals exist', async () => {
    // Create test meals
    const testMeals = [
      {
        name: 'Test Meal 1',
        primaryIngredients: ['ingredient1'],
        allergens: [],
        weather: ['cold'],
        timeOfDay: ['dinner'],
        flavorTags: ['savory']
      },
      {
        name: 'Test Meal 2',
        primaryIngredients: ['ingredient2'],
        allergens: [],
        weather: ['hot'],
        timeOfDay: ['lunch'],
        flavorTags: ['spicy']
      }
    ];
    await Meal.insertMany(testMeals);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meal).toBeDefined();
    expect(data.meal.name).toMatch(/Test Meal [12]/);
    expect(data.meal.primaryIngredients).toBeDefined();
    expect(data.meal.flavorTags).toBeDefined();
  });

  it('should return 404 when no meals exist', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('No meals found');
  });

  it('should return different meals on multiple calls', async () => {
    // Create multiple test meals to test randomness
    const testMeals = Array.from({ length: 10 }, (_, i) => ({
      name: `Test Meal ${i + 1}`,
      primaryIngredients: [`ingredient${i + 1}`],
      allergens: [],
      weather: ['normal'],
      timeOfDay: ['lunch'],
      flavorTags: ['test']
    }));
    await Meal.insertMany(testMeals);

    // Make multiple calls and collect meal names
    const mealNames = new Set();
    for (let i = 0; i < 5; i++) {
      const response = await GET();
      const data = await response.json();
      expect(response.status).toBe(200);
      mealNames.add(data.meal.name);
    }

    // With 10 meals and 5 calls, we should likely get some variety
    // This test might occasionally fail due to randomness, but it's very unlikely
    expect(mealNames.size).toBeGreaterThan(1);
  });
});