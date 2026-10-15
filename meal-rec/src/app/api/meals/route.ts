// ABOUTME: API route for GET /api/meals with pagination support
// ABOUTME: Returns paginated list of meals from the database

import { NextRequest, NextResponse } from 'next/server';
import { connect, Meal } from '@meal-rec/database';

export async function GET(request: NextRequest) {
  try {
    await connect();

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || '1');
    const limit = Number(searchParams.get('limit') || '10');

    // Validate pagination parameters
    if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const skip = (page - 1) * limit;

    const [meals, total] = await Promise.all([
      Meal.find({}).skip(skip).limit(limit).lean(),
      Meal.countDocuments()
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      meals,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching meals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}