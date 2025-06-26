// ABOUTME: Unit tests for the Feedback model
// ABOUTME: Validates required fields, enum constraints, and compound unique index

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Feedback } from './feedback';
import { User } from './user';
import { Meal } from './meal';
import { setupTestDb, teardownTestDb, clearTestDb } from '../test-setup';

describe('Feedback Model', () => {
  let testUser: any;
  let testMeal: any;

  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  beforeEach(async () => {
    await clearTestDb();
    
    testUser = await new User({
      username: 'feedbackuser',
      hashedPin: 'hash123'
    }).save();

    testMeal = await new Meal({
      name: 'Test Meal for Feedback',
      primaryIngredients: ['test'],
      allergens: [],
      weather: [],
      timeOfDay: [],
      flavorTags: []
    }).save();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should create feedback with valid type', async () => {
    const feedback = new Feedback({
      user: testUser._id,
      meal: testMeal._id,
      type: 'like'
    });

    const savedFeedback = await feedback.save();
    expect(savedFeedback.type).toBe('like');
    expect(savedFeedback.user.toString()).toBe(testUser._id.toString());
    expect(savedFeedback.meal.toString()).toBe(testMeal._id.toString());
  });

  it('should fail with invalid feedback type', async () => {
    const feedback = new Feedback({
      user: testUser._id,
      meal: testMeal._id,
      type: 'invalid' as any
    });

    await expect(feedback.save()).rejects.toThrow();
  });

  it('should fail without required user', async () => {
    const feedback = new Feedback({
      meal: testMeal._id,
      type: 'like'
    });

    await expect(feedback.save()).rejects.toThrow();
  });

  it('should fail without required meal', async () => {
    const feedback = new Feedback({
      user: testUser._id,
      type: 'like'
    });

    await expect(feedback.save()).rejects.toThrow();
  });

  it('should enforce unique user-meal combination', async () => {
    const feedback1 = new Feedback({
      user: testUser._id,
      meal: testMeal._id,
      type: 'interested'
    });
    await feedback1.save();

    const feedback2 = new Feedback({
      user: testUser._id,
      meal: testMeal._id,
      type: 'dislike'
    });

    await expect(feedback2.save()).rejects.toThrow();
  });

  it('should have indexes on user, meal, and timestamp fields', () => {
    const indexes = Feedback.schema.indexes();
    const userIndex = indexes.find(index => index[0].user === 1);
    const mealIndex = indexes.find(index => index[0].meal === 1);
    const timestampIndex = indexes.find(index => index[0].timestamp === 1);
    const compoundIndex = indexes.find(index => index[0].user === 1 && index[0].meal === 1);
    
    expect(userIndex).toBeDefined();
    expect(mealIndex).toBeDefined();
    expect(timestampIndex).toBeDefined();
    expect(compoundIndex).toBeDefined();
  });
});