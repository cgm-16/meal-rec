// ABOUTME: Database-backed tests for feedback helpers that depend on real query casting
// ABOUTME: Covers aggregation pipelines, which Mongoose does not cast like find() filters

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Feedback } from './models/feedback';
import { User } from './models/user';
import { Meal } from './models/meal';
import { getFeedbackStats } from './feedback-helpers';
import { setupTestDb, teardownTestDb, clearTestDb } from './test-setup';

describe('getFeedbackStats (database-backed)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('counts feedback for a user given their id as a string', async () => {
    const user = await new User({ username: 'statsuser', hashedPin: 'hash' }).save();
    const otherUser = await new User({ username: 'otheruser', hashedPin: 'hash' }).save();
    const meals = await Meal.insertMany(
      ['A', 'B', 'C'].map(name => ({ name, primaryIngredients: [], allergens: [], weather: [], timeOfDay: [], flavorTags: [] }))
    );
    await Feedback.insertMany([
      { user: user._id, meal: meals[0]._id, type: 'like' },
      { user: user._id, meal: meals[1]._id, type: 'like' },
      { user: user._id, meal: meals[2]._id, type: 'dislike' },
      { user: otherUser._id, meal: meals[0]._id, type: 'interested' }
    ]);

    const stats = await getFeedbackStats(user._id.toString());

    expect(stats).toEqual({ like: 2, interested: 0, dislike: 1, total: 3 });
  });
});
