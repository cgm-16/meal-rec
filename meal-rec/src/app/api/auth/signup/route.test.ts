// ABOUTME: Unit tests for user registration API endpoint
// ABOUTME: Tests input validation, password hashing, and duplicate user handling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock save function 
const mockUserSave = vi.fn();

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  User: Object.assign(vi.fn(), {
    findOne: vi.fn()
  })
}));

import { connect, User } from '@meal-rec/database';
import bcrypt from 'bcryptjs';

describe('/api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.findOne = vi.fn();
    vi.mocked(User).mockImplementation((data?: unknown) => ({
      ...(data as object),
      _id: 'user123',
      save: mockUserSave
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a new user with valid data', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    mockUserSave.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser',
        pin: '1234'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.message).toBe('User created successfully');
    expect(data.userId).toBe('user123');
    expect(User.findOne).toHaveBeenCalledWith({ username: 'testuser' });
    expect(mockUserSave).toHaveBeenCalled();
  });

  it('should store a bcrypt hash of the PIN, never the raw PIN', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    mockUserSave.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser', pin: '1234' })
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const { hashedPin } = vi.mocked(User).mock.calls[0][0] as { hashedPin: string };
    expect(hashedPin).not.toBe('1234');
    expect(await bcrypt.compare('1234', hashedPin)).toBe(true);
  });

  it('should only write fields defined in the User schema', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    mockUserSave.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser', pin: '1234' })
    });

    await POST(request);

    expect(User).toHaveBeenCalledWith({ username: 'testuser', hashedPin: expect.any(String) });
  });

  it.each(['12', '12345', 'abcd', '$2b$10$hashedpinvalue', 1234])(
    'should reject PIN %s that is not exactly 4 digits',
    async (pin) => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username: 'testuser', pin })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('PIN must be exactly 4 digits');
      expect(mockUserSave).not.toHaveBeenCalled();
    }
  );

  it('should reject missing username', async () => {
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        pin: '1234'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Username and PIN are required');
  });

  it('should reject missing pin', async () => {
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Username and PIN are required');
  });

  it('should reject username shorter than 3 characters', async () => {
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ab',
        pin: '1234'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Username must be at least 3 characters');
  });

  it('should reject duplicate username', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'existing123',
      username: 'testuser',
      hashedPin: '$2b$10$existingpin'
    });

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser',
        pin: '1234'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Username already exists');
    expect(mockUserSave).not.toHaveBeenCalled();
  });

  it('should handle database connection errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(connect).mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser',
        pin: '1234'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');

    expect(consoleError).toHaveBeenCalledWith('Sign-up error:', expect.any(Error));
  });

  it('should handle malformed JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: '{ invalid json'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');

    expect(consoleError).toHaveBeenCalledWith('Sign-up error:', expect.any(Error));
  });
});