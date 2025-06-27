// ABOUTME: API endpoint that provides personalized meal recommendations using the recommendation engine
// ABOUTME: Integrates quiz answers, user feedback, weather conditions, and candidate meals to select optimal meal

import { NextRequest, NextResponse } from 'next/server';
import { connect, Meal, Feedback } from '@meal-rec/database';
import { selectRecommendation } from '@meal-rec/core';
import type { QuizAnswers, FeedbackEntry, WeatherCondition } from '@meal-rec/core';

interface RecommendRequest {
  weather?: WeatherCondition;
  quiz?: QuizAnswers;
}


export async function POST(request: NextRequest) {
  try {
    await connect();

    const body: RecommendRequest = await request.json();
    const userId = request.headers.get('x-user-id');

    // 1. Gather quiz answers from request body or default values
    const quiz: QuizAnswers = body.quiz || {
      ingredientsToAvoid: [],
      spiciness: 2,
      surpriseFactor: 5
    };

    // 2. Get user feedback from last 14 days
    let recentFeedback: FeedbackEntry[] = [];
    if (userId) {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const feedbackRecords = await Feedback.find({
        user: userId,
        timestamp: { $gte: twoWeeksAgo }
      }).populate('meal');

      recentFeedback = feedbackRecords.map(record => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mealId: (record.meal as any)._id.toString(),
        type: record.type as 'like' | 'interested' | 'dislike',
        timestamp: record.timestamp
      }));
    }

    // 3. Get weather condition from request or default to 'normal'
    const weather: WeatherCondition = body.weather || 'normal';

    // 4. Query 50 random candidate meals from database
    const candidateMeals = await Meal.aggregate([
      { $sample: { size: 50 } }
    ]);

    if (candidateMeals.length === 0) {
      return NextResponse.json({ error: 'No meals available' }, { status: 404 });
    }

    // 5. Call recommendation engine
    const selectedMeal = selectRecommendation({
      quiz,
      recentFeedback,
      weather,
      candidateMeals
    });

    if (!selectedMeal) {
      return NextResponse.json({ error: 'No suitable meal found' }, { status: 404 });
    }

    // 6. Return selected meal
    return NextResponse.json(selectedMeal);

  } catch (error) {
    console.error('Recommendation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}