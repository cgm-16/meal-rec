// ABOUTME: MealCard component for displaying meal information with action buttons
// ABOUTME: Shows meal image, name, flavor tags with like/interested/dislike callbacks

'use client';

import Image from 'next/image';
import { useState } from 'react';

export interface Meal {
  _id: string;
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

interface MealCardProps {
  meal: Meal;
  onLike?: (mealId: string) => void;
  onInterested?: (mealId: string) => void;
  onDislike?: (mealId: string) => void;
}

export function MealCard({ meal, onLike, onInterested, onDislike }: MealCardProps) {
  const [imageError, setImageError] = useState(false);

  const handleLike = () => {
    onLike?.(meal._id);
  };

  const handleInterested = () => {
    onInterested?.(meal._id);
  };

  const handleDislike = () => {
    onDislike?.(meal._id);
  };

  return (
    <div data-testid="meal-card" className="max-w-[420px] w-full bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
      {/* Image Section */}
      <div className="relative h-48 w-full bg-gray-100">
        {meal.imageUrl && !imageError ? (
          <Image
            src={meal.imageUrl}
            alt={meal.name}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gray-200">
            <div className="text-gray-400 text-4xl">🍽️</div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-4">
        {/* Meal Name */}
        <h3 className="text-xl font-semibold text-gray-900 mb-2 line-clamp-2">
          {meal.name}
        </h3>

        {/* Cuisine */}
        {meal.cuisine && (
          <p className="text-sm text-gray-600 mb-3">
            {meal.cuisine} Cuisine
          </p>
        )}

        {/* Description */}
        {meal.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {meal.description}
          </p>
        )}

        {/* Flavor Tags */}
        {meal.flavorTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {meal.flavorTags.map((tag, index) => (
              <span
                key={index}
                className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 justify-between">
          <button
            data-testid="dislike-button"
            onClick={handleDislike}
            className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm font-medium"
            type="button"
          >
            👎 Not for me
          </button>
          
          <button
            data-testid="interested-button"
            onClick={handleInterested}
            className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors text-sm font-medium"
            type="button"
          >
            🤔 Maybe
          </button>
          
          <button
            data-testid="like-button"
            onClick={handleLike}
            className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-sm font-medium"
            type="button"
          >
            👍 I like it
          </button>
        </div>
      </div>
    </div>
  );
}