// ABOUTME: Unit tests for the Meal model
// ABOUTME: Validates required fields, constraints, and index creation

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Meal } from './meal';
import { setupTestDb, teardownTestDb, clearTestDb } from '../test-setup';

describe('Meal Model', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('should create a meal with required fields', async () => {
    const mealData = {
      name: 'Test Meal',
      primaryIngredients: ['chicken', 'rice'],
      allergens: ['gluten'],
      weather: ['cold'],
      timeOfDay: ['dinner'],
      spiciness: 3,
      heaviness: 4,
      flavorTags: ['savory', 'comfort']
    };

    const meal = new Meal(mealData);
    const savedMeal = await meal.save();

    expect(savedMeal.name).toBe('Test Meal');
    expect(savedMeal.spiciness).toBe(3);
    expect(savedMeal.heaviness).toBe(4);
    expect(savedMeal.primaryIngredients).toEqual(['chicken', 'rice']);
  });

  it('should fail without required name field', async () => {
    const meal = new Meal({
      primaryIngredients: ['test'],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    });

    await expect(meal.save()).rejects.toThrow();
  });

  it('should enforce spiciness constraints', async () => {
    const meal = new Meal({
      name: 'Spicy Test',
      spiciness: 6, // Invalid: max is 5
      heaviness: 3,
      primaryIngredients: [],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    });

    await expect(meal.save()).rejects.toThrow();
  });

  it('should enforce heaviness constraints', async () => {
    const meal = new Meal({
      name: 'Heavy Test',
      spiciness: 3,
      heaviness: -1, // Invalid: min is 0
      primaryIngredients: [],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    });

    await expect(meal.save()).rejects.toThrow();
  });

  it('should have index on name field', () => {
    const indexes = Meal.schema.indexes();
    const nameIndex = indexes.find(index => index[0].name === 1);
    expect(nameIndex).toBeDefined();
  });
});