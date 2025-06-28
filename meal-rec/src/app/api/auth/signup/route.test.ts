// ABOUTME: Unit tests for user registration API endpoint
// ABOUTME: Tests input validation, password hashing, and duplicate user handling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  User: {
    findOne: vi.fn(),
    prototype: {
      save: vi.fn()
    }
  }
}));

import { connect, User } from '@meal-rec/database';

// Mock User constructor
const mockUserSave = vi.fn();
const MockUser = vi.fn().mockImplementation((data) => ({
  ...data,
  _id: 'user123',
  save: mockUserSave
}));

describe('/api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.findOne = vi.fn();
    // Mock User constructor and methods
    Object.assign(User, MockUser);
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
        hashedPin: '$2b$10$hashedpinvalue'
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

  it('should reject missing username', async () => {
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        hashedPin: '$2b$10$hashedpinvalue'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Username and PIN are required');
  });

  it('should reject missing hashedPin', async () => {
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
        hashedPin: '$2b$10$hashedpinvalue'
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
        hashedPin: '$2b$10$hashedpinvalue'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Username already exists');
    expect(mockUserSave).not.toHaveBeenCalled();
  });

  it('should handle database connection errors', async () => {
    vi.mocked(connect).mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser',
        hashedPin: '$2b$10$hashedpinvalue'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });

  it('should handle malformed JSON', async () => {
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: '{ invalid json'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});