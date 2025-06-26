// ABOUTME: Unit tests for the User model
// ABOUTME: Validates required fields, unique constraints, and preferences structure

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { User } from './user';
import { setupTestDb, teardownTestDb, clearTestDb } from '../test-setup';

describe('User Model', () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('should create a user with required fields', async () => {
    const userData = {
      username: 'testuser',
      hashedPin: 'hashed123',
      preferences: {
        spiciness: 3,
        surpriseFactor: 7,
        ingredientsToAvoid: ['mushrooms']
      }
    };

    const user = new User(userData);
    const savedUser = await user.save();

    expect(savedUser.username).toBe('testuser');
    expect(savedUser.hashedPin).toBe('hashed123');
    expect(savedUser.preferences?.spiciness).toBe(3);
    expect(savedUser.preferences?.surpriseFactor).toBe(7);
  });

  it('should fail without required username', async () => {
    const user = new User({
      hashedPin: 'hashed123'
    });

    await expect(user.save()).rejects.toThrow();
  });

  it('should fail without required hashedPin', async () => {
    const user = new User({
      username: 'testuser2'
    });

    await expect(user.save()).rejects.toThrow();
  });

  it('should enforce unique username constraint', async () => {
    const user1 = new User({
      username: 'duplicate',
      hashedPin: 'hash1'
    });
    await user1.save();

    const user2 = new User({
      username: 'duplicate',
      hashedPin: 'hash2'
    });

    await expect(user2.save()).rejects.toThrow();
  });

  it('should have index on username field', () => {
    const indexes = User.schema.indexes();
    const usernameIndex = indexes.find(index => index[0].username === 1);
    expect(usernameIndex).toBeDefined();
  });
});