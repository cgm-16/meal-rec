// ABOUTME: Query helpers and utilities for feedback data with sliding window functionality
// ABOUTME: Provides recent feedback queries and automated cleanup of old feedback data

import { Feedback, IFeedback } from './models/feedback';
import * as cron from 'node-cron';

/**
 * Get recent feedback for a user within a specified number of days
 * @param userId - User ID to get feedback for
 * @param days - Number of days to look back (default: 14)
 * @returns Promise of feedback entries within the time window
 */
export async function getRecentFeedback(userId: string, days: number = 14): Promise<IFeedback[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return await Feedback.find({
    user: userId,
    timestamp: { $gte: cutoffDate }
  })
  .populate('meal')
  .sort({ timestamp: -1 });
}

/**
 * Delete feedback older than specified number of days
 * @param days - Number of days to keep (default: 14)
 * @returns Promise with deletion result
 */
export async function deleteOldFeedback(days: number = 14): Promise<{ deletedCount: number }> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const result = await Feedback.deleteMany({
    timestamp: { $lt: cutoffDate }
  });
  
  console.log(`Deleted ${result.deletedCount} feedback entries older than ${days} days`);
  return { deletedCount: result.deletedCount };
}

/**
 * Get feedback statistics for a user within a time window
 * @param userId - User ID to get stats for
 * @param days - Number of days to look back (default: 14)
 * @returns Promise with feedback statistics
 */
export async function getFeedbackStats(userId: string, days: number = 14) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await Feedback.aggregate([
    {
      $match: {
        user: userId,
        timestamp: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    like: 0,
    interested: 0,
    dislike: 0,
    total: 0
  };
  
  stats.forEach(stat => {
    result[stat._id as keyof typeof result] = stat.count;
    result.total += stat.count;
  });
  
  return result;
}

/**
 * CRON job to automatically delete feedback older than 14 days
 * Runs daily at 2:00 AM
 */
let cleanupCronJob: cron.ScheduledTask | null = null;

export function startFeedbackCleanupCron(): cron.ScheduledTask {
  if (cleanupCronJob) {
    console.log('Feedback cleanup CRON job is already running');
    return cleanupCronJob;
  }
  
  // Run daily at 2:00 AM
  cleanupCronJob = cron.schedule('0 2 * * *', async () => {
    try {
      console.log('Starting scheduled feedback cleanup...');
      const result = await deleteOldFeedback(14);
      console.log(`Scheduled cleanup completed: ${result.deletedCount} entries deleted`);
    } catch (error) {
      console.error('Error during scheduled feedback cleanup:', error);
    }
  }, {
    timezone: 'UTC'
  });
  
  console.log('Feedback cleanup CRON job started (daily at 2:00 AM UTC)');
  return cleanupCronJob;
}

export function stopFeedbackCleanupCron(): void {
  if (cleanupCronJob) {
    cleanupCronJob.stop();
    cleanupCronJob = null;
    console.log('Feedback cleanup CRON job stopped');
  }
}

/**
 * Get all feedback for a meal within a time window (for analytics)
 * @param mealId - Meal ID to get feedback for
 * @param days - Number of days to look back (default: 14)
 * @returns Promise with feedback entries for the meal
 */
export async function getMealFeedback(mealId: string, days: number = 14): Promise<IFeedback[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return await Feedback.find({
    meal: mealId,
    timestamp: { $gte: cutoffDate }
  })
  .populate('user')
  .sort({ timestamp: -1 });
}