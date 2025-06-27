// ABOUTME: Unit tests for admin users API endpoint with role-based access control
// ABOUTME: Tests user listing functionality and admin authentication requirements

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

// Mock dependencies
vi.mock('@meal-rec/database', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  User: {
    find: vi.fn()
  }
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn()
}));

import { connect, User } from '@meal-rec/database';
import { requireAdmin } from '@/lib/admin-auth';

const mockUsers = [
  {
    _id: 'admin-id',
    username: 'admin',
    role: 'admin',
    banned: false,
    createdAt: '2025-06-27T16:14:36.439Z'
  },
  {
    _id: 'user-id',
    username: 'testuser',
    role: 'user',
    banned: false,
    createdAt: '2025-06-27T16:14:36.439Z'
  }
];

describe('/api/admin/users GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should require admin authentication', async () => {
    const mockAuthError = new Response('Unauthorized', { status: 401 });
    vi.mocked(requireAdmin).mockResolvedValue(mockAuthError);

    const response = await GET();
    
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(response.status).toBe(401);
  });

  it('should return users list for admin user', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    
    const mockFind = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockUsers)
    };
    vi.mocked(User.find).mockReturnValue(mockFind as any);

    const response = await GET();
    const data = await response.json();

    expect(connect).toHaveBeenCalledOnce();
    expect(User.find).toHaveBeenCalledWith({});
    expect(mockFind.select).toHaveBeenCalledWith('-hashedPin');
    expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(mockFind.limit).toHaveBeenCalledWith(100);
    expect(response.status).toBe(200);
    expect(data).toEqual({ users: mockUsers });
  });

  it('should handle database errors', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    vi.mocked(connect).mockRejectedValue(new Error('Database error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Admin users list error:', expect.any(Error));
  });

  it('should exclude password hashes from response', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    
    const mockFind = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockUsers)
    };
    vi.mocked(User.find).mockReturnValue(mockFind as any);

    await GET();

    expect(mockFind.select).toHaveBeenCalledWith('-hashedPin');
  });
});