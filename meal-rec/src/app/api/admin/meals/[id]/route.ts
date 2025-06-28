// ABOUTME: Admin API for individual meal operations - get, update, delete by ID
// ABOUTME: Protected endpoints requiring admin role for specific meal management

import { NextRequest, NextResponse } from 'next/server';
import { connect, Meal } from '@meal-rec/database';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    const resolvedParams = await params;
    
    const meal = await Meal.findById(resolvedParams.id);
    if (!meal) {
      return NextResponse.json(
        { error: 'Meal not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ meal });
  } catch (error) {
    console.error('Admin meal get error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    const resolvedParams = await params;
    
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
    
    const meal = await Meal.findByIdAndUpdate(
      resolvedParams.id,
      {
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
      },
      { new: true, runValidators: true }
    );
    
    if (!meal) {
      return NextResponse.json(
        { error: 'Meal not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ meal });
  } catch (error) {
    console.error('Admin meal update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    await connect();
    const resolvedParams = await params;
    
    const meal = await Meal.findByIdAndDelete(resolvedParams.id);
    if (!meal) {
      return NextResponse.json(
        { error: 'Meal not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      message: 'Meal deleted successfully',
      meal 
    });
  } catch (error) {
    console.error('Admin meal delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}