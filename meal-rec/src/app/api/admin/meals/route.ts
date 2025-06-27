// ABOUTME: Admin API for meal management - list, create, update operations
// ABOUTME: Protected endpoints requiring admin role for meal CRUD operations

import { NextRequest, NextResponse } from 'next/server';
import { connect, Meal } from '@meal-rec/database';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    
    const meals = await Meal.find({})
      .sort({ createdAt: -1 })
      .limit(100); // Reasonable limit for admin interface
    
    return NextResponse.json({ meals });
  } catch (error) {
    console.error('Admin meals list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    
    const body = await request.json();
    const {
      name,
      cuisine,
      primaryIngredients,
      allergens,
      weather,
      timeOfDay,
      spiciness,
      heaviness,
      imageUrl,
      description,
      flavorTags
    } = body;
    
    // Validate required fields
    if (!name || !primaryIngredients || !Array.isArray(primaryIngredients)) {
      return NextResponse.json(
        { error: 'Name and primaryIngredients are required' },
        { status: 400 }
      );
    }
    
    // Validate numeric fields
    if (spiciness !== undefined && (spiciness < 0 || spiciness > 5)) {
      return NextResponse.json(
        { error: 'Spiciness must be between 0 and 5' },
        { status: 400 }
      );
    }
    
    if (heaviness !== undefined && (heaviness < 0 || heaviness > 5)) {
      return NextResponse.json(
        { error: 'Heaviness must be between 0 and 5' },
        { status: 400 }
      );
    }
    
    const meal = new Meal({
      name,
      cuisine,
      primaryIngredients,
      allergens: allergens || [],
      weather: weather || [],
      timeOfDay: timeOfDay || [],
      spiciness: spiciness || 0,
      heaviness: heaviness || 0,
      imageUrl,
      description,
      flavorTags: flavorTags || []
    });
    
    await meal.save();
    
    return NextResponse.json({ meal }, { status: 201 });
  } catch (error) {
    console.error('Admin meal creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}