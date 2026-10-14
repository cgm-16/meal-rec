// ABOUTME: API endpoint that provides personalized meal recommendations using the recommendation engine
// ABOUTME: Integrates quiz answers, user feedback, weather conditions, and candidate meals to select optimal meal

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connect, Meal, getRecentFeedback } from '@meal-rec/database';
import { selectRecommendation } from '@meal-rec/core';
import type { QuizAnswers, FeedbackEntry, WeatherCondition } from '@meal-rec/core';
import { APP_CONSTANTS } from '@/lib/constants';
import { authOptions } from '@/lib/auth';
import type { Types } from 'mongoose';

interface RecommendRequest {
  weather?: WeatherCondition;
  quiz?: QuizAnswers;
}

// Type for feedback records with populated meal field
interface PopulatedFeedbackRecord {
  meal: { _id: Types.ObjectId; cuisine?: string; heaviness: number; spiciness: number } | null;
  type: 'like' | 'interested' | 'dislike';
  timestamp: Date;
}


export async function POST(request: NextRequest) {
  try {
    await connect();

    const body: RecommendRequest = await request.json();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // 1. Gather quiz answers from request body or default values
    const quiz: QuizAnswers = body.quiz || {
      ingredientsToAvoid: [],
      spiciness: APP_CONSTANTS.DEFAULT_QUIZ_SPICINESS,
      surpriseFactor: APP_CONSTANTS.DEFAULT_QUIZ_SURPRISE_FACTOR
    };

    // 2. Get user feedback from last 14 days using helper function
    let recentFeedback: FeedbackEntry[] = [];
    if (userId) {
      const feedbackRecords = await getRecentFeedback(userId, APP_CONSTANTS.RECENT_FEEDBACK_DAYS) as unknown as PopulatedFeedbackRecord[];

      // Feedback on a since-deleted meal populates to null; it can no longer be scored
      recentFeedback = feedbackRecords.flatMap(({ meal, type, timestamp }) => meal ? [{
        mealId: meal._id.toString(),
        type,
        timestamp,
        meal: { cuisine: meal.cuisine, heaviness: meal.heaviness, spiciness: meal.spiciness }
      }] : []);
    }

    // 3. Get weather condition from request or default to 'normal'
    const weather: WeatherCondition = body.weather || 'normal';

    // 4. Query random candidate meals from database
    const candidateMeals = await Meal.aggregate([
      { $sample: { size: APP_CONSTANTS.CANDIDATE_MEALS_SAMPLE_SIZE } }
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