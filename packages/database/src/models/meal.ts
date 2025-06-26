// ABOUTME: Mongoose schema and model for meal entities
// ABOUTME: Defines the structure for storing meal data with cuisine, ingredients, allergens, and metadata

import mongoose, { Schema, Document } from 'mongoose';

export interface IMeal extends Document {
  name: string;
  cuisine?: string;
  primaryIngredients: string[];
  allergens: string[];
  weather: string[];
  timeOfDay: string[];
  spiciness: number;
  heaviness: number;
  imageUrl?: string;
  description?: string;
  flavorTags: string[];
}

const MealSchema = new Schema<IMeal>({
  name: { 
    type: String, 
    required: true, 
    index: true 
  },
  cuisine: String,
  primaryIngredients: [String],
  allergens: [String],
  weather: [String],
  timeOfDay: [String],
  spiciness: { 
    type: Number, 
    min: 0, 
    max: 5 
  },
  heaviness: { 
    type: Number, 
    min: 0, 
    max: 5 
  },
  imageUrl: String,
  description: String,
  flavorTags: [String],
}, {
  timestamps: true
});

export const Meal = mongoose.model<IMeal>('Meal', MealSchema);