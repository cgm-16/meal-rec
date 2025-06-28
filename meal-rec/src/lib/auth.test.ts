// ABOUTME: Unit tests for NextAuth configuration and authentication logic
// ABOUTME: Tests credential validation, PIN verification, and session management

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { authOptions } from './auth';
import type { CredentialsConfig } from 'next-auth/providers/credentials';

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  User: {
    findOne: vi.fn()
  }
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn()
  }
}));

import { connect, User } from '@meal-rec/database';

describe('Auth Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CredentialsProvider authorize', () => {
    const getCredentialsProvider = () => authOptions.providers[0] as CredentialsConfig;
    const getAuthorize = () => getCredentialsProvider().authorize;

    it('should return null for missing credentials', async () => {
      const authorize = getAuthorize();
      const result = await authorize(null);
      expect(result).toBeNull();
    });

    it('should return null for missing username', async () => {
      const authorize = getAuthorize();
      const result = await authorize({ pin: '1234' });
      expect(result).toBeNull();
    });

    it('should return null for missing pin', async () => {
      const authorize = getAuthorize();
      const result = await authorize({ username: 'testuser' });
      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const authorize = getAuthorize();
      vi.mocked(User.findOne).mockResolvedValue(null);

      const result = await authorize({
        username: 'nonexistent',
        pin: '1234'
      });

      expect(result).toBeNull();
      expect(User.findOne).toHaveBeenCalledWith({ username: 'nonexistent' });
    });

    it('should return null for invalid PIN', async () => {
      const authorize = getAuthorize();
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'user123',
        username: 'testuser',
        hashedPin: '$2b$10$hashedpin'
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      const result = await authorize({
        username: 'testuser',
        pin: '1234'
      });

      expect(result).toBeNull();
      expect(bcrypt.compare).toHaveBeenCalledWith('1234', '$2b$10$hashedpin');
    });

    it('should return user object for valid credentials', async () => {
      const authorize = getAuthorize();
      const mockUser = {
        _id: 'user123',
        username: 'testuser',
        hashedPin: '$2b$10$hashedpin'
      };
      vi.mocked(User.findOne).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      const result = await authorize({
        username: 'testuser',
        pin: '1234'
      });

      expect(result).toEqual({
        id: 'user123',
        name: 'testuser',
        email: null
      });
      expect(connect).toHaveBeenCalled();
      expect(User.findOne).toHaveBeenCalledWith({ username: 'testuser' });
      expect(bcrypt.compare).toHaveBeenCalledWith('1234', '$2b$10$hashedpin');
    });

    it('should handle database errors gracefully', async () => {
      const authorize = getAuthorize();
      vi.mocked(connect).mockRejectedValue(new Error('Database error'));

      const result = await authorize({
        username: 'testuser',
        pin: '1234'
      });

      expect(result).toBeNull();
    });
  });

  describe('Callbacks', () => {
    it('should add userId to JWT token when user is present', async () => {
      const token = {};
      const user = { id: 'user123' };

      const result = await authOptions.callbacks!.jwt!({ token, user } as Parameters<NonNullable<typeof authOptions.callbacks.jwt>>[0]);

      expect(result).toEqual({ userId: 'user123' });
    });

    it('should preserve existing token when no user', async () => {
      const token = { userId: 'existing123', other: 'data' };

      const result = await authOptions.callbacks!.jwt!({ token } as Parameters<NonNullable<typeof authOptions.callbacks.jwt>>[0]);

      expect(result).toEqual({ userId: 'existing123', other: 'data' });
    });

    it('should add user id to session when token has userId', async () => {
      const session = { user: {} };
      const token = { userId: 'user123' };

      const result = await authOptions.callbacks!.session!({ session, token } as Parameters<NonNullable<typeof authOptions.callbacks.session>>[0]);

      expect(result).toEqual({
        user: { id: 'user123' }
      });
    });

    it('should preserve session when token has no userId', async () => {
      const session = { user: { name: 'test' } };
      const token = {};

      const result = await authOptions.callbacks!.session!({ session, token } as Parameters<NonNullable<typeof authOptions.callbacks.session>>[0]);

      expect(result).toEqual({
        user: { name: 'test' }
      });
    });
  });

  describe('Configuration', () => {
    it('should have correct session configuration', () => {
      expect(authOptions.session).toEqual({
        strategy: 'jwt',
        maxAge: 7 * 24 * 60 * 60 // 7 days
      });
    });

    it('should have correct pages configuration', () => {
      expect(authOptions.pages).toEqual({
        signIn: '/auth/signin'
      });
    });

    it('should have credentials provider configured', () => {
      const credentialsProvider = getCredentialsProvider();
      expect(authOptions.providers).toHaveLength(1);
      expect(credentialsProvider.name).toBe('credentials');
      expect(credentialsProvider.credentials).toEqual({
        username: { label: 'Username', type: 'text' },
        pin: { label: 'PIN', type: 'password', maxLength: 4 }
      });
    });
  });
});