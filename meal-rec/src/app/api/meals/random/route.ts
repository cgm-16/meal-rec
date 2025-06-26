// ABOUTME: API route for GET /api/meals/random
// ABOUTME: Returns one random meal from the database

import { NextResponse } from 'next/server';
import { connect, Meal } from '@meal-rec/database';

export async function GET() {
  try {
    await connect();

    // Get a random meal using MongoDB aggregation
    const randomMeals = await Meal.aggregate([
      { $sample: { size: 1 } }
    ]);

    if (randomMeals.length === 0) {
      return NextResponse.json(
        { error: 'No meals found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      meal: randomMeals[0]
    });

  } catch (error) {
    console.error('Error fetching random meal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}