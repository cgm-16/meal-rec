// ABOUTME: Unit tests for feedback query helpers
// ABOUTME: Tests sliding window queries, cleanup operations, and scheduled tasks

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Types } from 'mongoose';

// Type for the Mongoose query chain mock
interface MockQueryChain {
  populate: ReturnType<typeof vi.fn>;
  sort: ReturnType<typeof vi.fn>;
}

// Types for mocks - defined inline to avoid unused interface warnings
import { 
  getRecentFeedback, 
  deleteOldFeedback, 
  getFeedbackStats, 
  getMealFeedback
} from './feedback-helpers';

// Mock the Feedback model
vi.mock('./models/feedback', () => ({
  Feedback: {
    find: vi.fn(),
    deleteMany: vi.fn(),
    aggregate: vi.fn()
  }
}));

import { Feedback } from './models/feedback';

const mockFeedbackData = [
  {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(),
    meal: { _id: new Types.ObjectId(), name: 'Test Meal 1' },
    type: 'like',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
  },
  {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(),
    meal: { _id: new Types.ObjectId(), name: 'Test Meal 2' },
    type: 'dislike',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
  }
];

describe('Feedback Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRecentFeedback', () => {
    it('should get feedback within default 14 day window', async () => {
      const mockFind: MockQueryChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue(mockFeedbackData)
      };
      vi.mocked(Feedback.find).mockReturnValue(mockFind as never);

      const userId = 'user123';
      const result = await getRecentFeedback(userId);

      expect(Feedback.find).toHaveBeenCalledWith({
        user: userId,
        timestamp: { $gte: expect.any(Date) }
      });
      expect(mockFind.populate).toHaveBeenCalledWith('meal');
      expect(mockFind.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(result).toEqual(mockFeedbackData);
    });

    it('should get feedback within custom day window', async () => {
      const mockFind: MockQueryChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue(mockFeedbackData)
      };
      vi.mocked(Feedback.find).mockReturnValue(mockFind as never);

      const userId = 'user123';
      const days = 7;
      await getRecentFeedback(userId, days);

      const expectedCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      expect(Feedback.find).toHaveBeenCalledWith({
        user: userId,
        timestamp: { $gte: expect.any(Date) }
      });

      // Check the cutoff date is approximately correct (within 1 second)
      const actualCall = vi.mocked(Feedback.find).mock.calls[0][0];
      const actualCutoff = actualCall.timestamp.$gte;
      expect(Math.abs(actualCutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
    });

    it('should handle empty results', async () => {
      const mockFind: MockQueryChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue([])
      };
      vi.mocked(Feedback.find).mockReturnValue(mockFind as never);

      const result = await getRecentFeedback('user123');
      expect(result).toEqual([]);
    });
  });

  describe('deleteOldFeedback', () => {
    it('should delete feedback older than default 14 days', async () => {
      const mockDeleteResult = { deletedCount: 5 };
      vi.mocked(Feedback.deleteMany).mockResolvedValue(mockDeleteResult as never);

      const result = await deleteOldFeedback();

      expect(Feedback.deleteMany).toHaveBeenCalledWith({
        timestamp: { $lt: expect.any(Date) }
      });
      expect(result).toEqual({ deletedCount: 5 });
      expect(console.log).toHaveBeenCalledWith('Deleted 5 feedback entries older than 14 days');
    });

    it('should delete feedback older than custom days', async () => {
      const mockDeleteResult = { deletedCount: 3 };
      vi.mocked(Feedback.deleteMany).mockResolvedValue(mockDeleteResult as never);

      const days = 30;
      const result = await deleteOldFeedback(days);

      const expectedCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      expect(Feedback.deleteMany).toHaveBeenCalledWith({
        timestamp: { $lt: expect.any(Date) }
      });

      // Check the cutoff date is approximately correct
      const actualCall = vi.mocked(Feedback.deleteMany).mock.calls[0][0];
      const actualCutoff = actualCall.timestamp.$lt;
      expect(Math.abs(actualCutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);

      expect(result).toEqual({ deletedCount: 3 });
      expect(console.log).toHaveBeenCalledWith('Deleted 3 feedback entries older than 30 days');
    });

    it('should handle zero deletions', async () => {
      const mockDeleteResult = { deletedCount: 0 };
      vi.mocked(Feedback.deleteMany).mockResolvedValue(mockDeleteResult as never);

      const result = await deleteOldFeedback();
      expect(result).toEqual({ deletedCount: 0 });
      expect(console.log).toHaveBeenCalledWith('Deleted 0 feedback entries older than 14 days');
    });
  });

  describe('getFeedbackStats', () => {
    it('should return feedback statistics within time window', async () => {
      const mockAggregateResult = [
        { _id: 'like', count: 5 },
        { _id: 'dislike', count: 2 },
        { _id: 'interested', count: 3 }
      ];
      vi.mocked(Feedback.aggregate).mockResolvedValue(mockAggregateResult);

      const userId = 'user123';
      const result = await getFeedbackStats(userId);

      expect(Feedback.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            user: userId,
            timestamp: { $gte: expect.any(Date) }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);

      expect(result).toEqual({
        like: 5,
        interested: 3,
        dislike: 2,
        total: 10
      });
    });

    it('should handle missing feedback types', async () => {
      const mockAggregateResult = [
        { _id: 'like', count: 3 }
      ];
      vi.mocked(Feedback.aggregate).mockResolvedValue(mockAggregateResult);

      const result = await getFeedbackStats('user123');

      expect(result).toEqual({
        like: 3,
        interested: 0,
        dislike: 0,
        total: 3
      });
    });

    it('should handle empty results', async () => {
      vi.mocked(Feedback.aggregate).mockResolvedValue([]);

      const result = await getFeedbackStats('user123');

      expect(result).toEqual({
        like: 0,
        interested: 0,
        dislike: 0,
        total: 0
      });
    });
  });

  describe('getMealFeedback', () => {
    it('should get feedback for a specific meal', async () => {
      const mockFind: MockQueryChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue(mockFeedbackData)
      };
      vi.mocked(Feedback.find).mockReturnValue(mockFind as never);

      const mealId = 'meal123';
      const result = await getMealFeedback(mealId);

      expect(Feedback.find).toHaveBeenCalledWith({
        meal: mealId,
        timestamp: { $gte: expect.any(Date) }
      });
      expect(mockFind.populate).toHaveBeenCalledWith('user');
      expect(mockFind.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(result).toEqual(mockFeedbackData);
    });

    it('should support custom time window', async () => {
      const mockFind: MockQueryChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue([])
      };
      vi.mocked(Feedback.find).mockReturnValue(mockFind as never);

      const mealId = 'meal123';
      const days = 7;
      await getMealFeedback(mealId, days);

      const expectedCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const actualCall = vi.mocked(Feedback.find).mock.calls[0][0];
      const actualCutoff = actualCall.timestamp.$gte;
      expect(Math.abs(actualCutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
    });
  });
});