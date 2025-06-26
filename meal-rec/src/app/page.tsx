'use client';

import { useState, useEffect } from 'react';
import { MealCard, type Meal } from '@/components/MealCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  const [meal, setMeal] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRandomMeal = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/meals/random');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch meal');
      }
      
      setMeal(data.meal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (mealId: string, type: 'like' | 'interested' | 'dislike') => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mealId, type }),
      });

      // Always fetch a new meal after feedback attempt, regardless of success
      await fetchRandomMeal();
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      // Still fetch a new meal even if feedback fails
      await fetchRandomMeal();
    }
  };

  const handleLike = (mealId: string) => handleFeedback(mealId, 'like');
  const handleInterested = (mealId: string) => handleFeedback(mealId, 'interested');
  const handleDislike = (mealId: string) => handleFeedback(mealId, 'dislike');

  useEffect(() => {
    fetchRandomMeal();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">MealRec</h1>
          <p className="text-gray-600">Discover your next favorite meal</p>
        </div>

        <div className="flex justify-center">
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <div className="text-center p-8">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchRandomMeal}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : meal ? (
            <MealCard
              meal={meal}
              onLike={handleLike}
              onInterested={handleInterested}
              onDislike={handleDislike}
            />
          ) : null}
        </div>

        {!loading && !error && meal && (
          <div className="text-center mt-6">
            <button
              onClick={fetchRandomMeal}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Get Another Recommendation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
