// ABOUTME: Analytics API endpoint providing aggregated feedback data for explore page
// ABOUTME: Returns top liked/disliked meals and popular flavor tags from user feedback

import { NextResponse } from 'next/server';
import { connect, Feedback } from '@meal-rec/database';
import { APP_CONSTANTS } from '@/lib/constants';

export async function GET() {
  try {
    await connect();

    // Run aggregation pipelines in parallel
    const [topLikedMeals, topDislikedMeals, topFlavorTags] = await Promise.all([
      getTopLikedMeals(),
      getTopDislikedMeals(), 
      getTopFlavorTags()
    ]);

    return NextResponse.json({
      topLikedMeals,
      topDislikedMeals,
      topFlavorTags
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getTopLikedMeals() {
  const results = await Feedback.aggregate([
    { $match: { type: 'like' } },
    { 
      $group: {
        _id: '$meal',
        likeCount: { $sum: 1 }
      }
    },
    { $sort: { likeCount: -1 } },
    { $limit: APP_CONSTANTS.ANALYTICS_RESULTS_LIMIT },
    {
      $lookup: {
        from: 'meals',
        localField: '_id',
        foreignField: '_id',
        as: 'mealData'
      }
    },
    { $unwind: '$mealData' },
    {
      $project: {
        name: '$mealData.name',
        cuisine: '$mealData.cuisine',
        imageUrl: '$mealData.imageUrl',
        flavorTags: '$mealData.flavorTags',
        likeCount: 1
      }
    }
  ]);

  return results;
}

async function getTopDislikedMeals() {
  const results = await Feedback.aggregate([
    { $match: { type: 'dislike' } },
    { 
      $group: {
        _id: '$meal',
        dislikeCount: { $sum: 1 }
      }
    },
    { $sort: { dislikeCount: -1 } },
    { $limit: APP_CONSTANTS.ANALYTICS_RESULTS_LIMIT },
    {
      $lookup: {
        from: 'meals',
        localField: '_id',
        foreignField: '_id',
        as: 'mealData'
      }
    },
    { $unwind: '$mealData' },
    {
      $project: {
        name: '$mealData.name',
        cuisine: '$mealData.cuisine',
        imageUrl: '$mealData.imageUrl',
        flavorTags: '$mealData.flavorTags',
        dislikeCount: 1
      }
    }
  ]);

  return results;
}

async function getTopFlavorTags() {
  const results = await Feedback.aggregate([
    { $match: { type: { $in: ['like', 'interested'] } } },
    {
      $lookup: {
        from: 'meals',
        localField: 'meal',
        foreignField: '_id',
        as: 'mealData'
      }
    },
    { $unwind: '$mealData' },
    { $unwind: '$mealData.flavorTags' },
    {
      $group: {
        _id: '$mealData.flavorTags',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: APP_CONSTANTS.ANALYTICS_RESULTS_LIMIT },
    {
      $project: {
        tag: '$_id',
        count: 1,
        _id: 0
      }
    }
  ]);

  return results;
}