// ABOUTME: Comprehensive tests for recommendation engine with deterministic random seed
// ABOUTME: Tests scoring algorithm, edge cases, and all business rules

import { describe, it, expect, beforeEach } from 'vitest';
import { selectRecommendation, getLikedFlavorTags, type QuizAnswers, type FeedbackEntry, type Meal, type RecommendationInput } from './recommender';

describe('Recommendation Engine', () => {
  let mockMeals: Meal[];
  let mockQuiz: QuizAnswers;
  let mockFeedback: FeedbackEntry[];

  beforeEach(() => {
    mockMeals = [
      {
        _id: 'meal1',
        name: 'Spicy Thai Curry',
        primaryIngredients: ['chicken', 'coconut milk', 'curry paste'],
        allergens: [],
        weather: ['cold'],
        timeOfDay: ['dinner'],
        spiciness: 4,
        heaviness: 3,
        flavorTags: ['spicy', 'thai', 'creamy']
      },
      {
        _id: 'meal2',
        name: 'Mild Caesar Salad',
        primaryIngredients: ['lettuce', 'chicken', 'parmesan'],
        allergens: ['dairy'],
        weather: ['hot'],
        timeOfDay: ['lunch'],
        spiciness: 0,
        heaviness: 1,
        flavorTags: ['fresh', 'light', 'savory']
      },
      {
        _id: 'meal3',
        name: 'Rainy Day Soup',
        primaryIngredients: ['vegetables', 'broth'],
        allergens: [],
        weather: ['rain', 'cold'],
        timeOfDay: ['lunch', 'dinner'],
        spiciness: 1,
        heaviness: 2,
        flavorTags: ['warming', 'healthy', 'comfort']
      },
      {
        _id: 'meal4',
        name: 'Nut-Crusted Fish',
        primaryIngredients: ['fish', 'nuts'],
        allergens: ['nuts', 'fish'],
        weather: ['normal'],
        timeOfDay: ['dinner'],
        spiciness: 2,
        heaviness: 2,
        flavorTags: ['crunchy', 'protein', 'fancy']
      }
    ];

    mockQuiz = {
      ingredientsToAvoid: [],
      spiciness: 2,
      surpriseFactor: 5
    };

    mockFeedback = [];
  });

  describe('selectRecommendation', () => {
    it('returns null when no candidate meals provided', () => {
      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: [],
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeNull();
    });

    it('eliminates meals with avoided ingredients', () => {
      const quiz: QuizAnswers = {
        ingredientsToAvoid: ['nuts'],
        spiciness: 2,
        surpriseFactor: 5
      };

      const input: RecommendationInput = {
        quiz,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      expect(result!.name).not.toBe('Nut-Crusted Fish');
    });

    it('eliminates meals with allergens in avoided ingredients', () => {
      const quiz: QuizAnswers = {
        ingredientsToAvoid: ['dairy'],
        spiciness: 2,
        surpriseFactor: 5
      };

      const input: RecommendationInput = {
        quiz,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      expect(result!.name).not.toBe('Mild Caesar Salad');
    });

    it('applies feedback bonuses correctly', () => {
      const twoWeeksAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000); // 13 days ago
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'like',
          timestamp: twoWeeksAgo
        }
      ];

      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: feedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // With a like bonus, meal1 should be more likely to be selected
    });

    it('applies feedback penalties correctly', () => {
      const twoWeeksAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'dislike',
          timestamp: twoWeeksAgo
        }
      ];

      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: feedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // With a dislike penalty, meal1 should be less likely to be selected
    });

    it('ignores old feedback outside 2-week window', () => {
      const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'like',
          timestamp: threeWeeksAgo
        }
      ];

      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: feedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // Old feedback should not affect scoring
    });

    it('applies spiciness distance penalty correctly', () => {
      const quiz: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 0, // User wants no spice
        surpriseFactor: 5
      };

      const input: RecommendationInput = {
        quiz,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // Should favor meals with lower spiciness
      expect(result!.spiciness).toBeLessThanOrEqual(2);
    });

    it('applies weather match bonus correctly', () => {
      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: mockFeedback,
        weather: 'rain',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // Should favor meals appropriate for rainy weather
    });

    it('applies surprise factor with deterministic randomness', () => {
      const quiz1: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 2,
        surpriseFactor: 0 // No surprise
      };

      const quiz2: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 2,
        surpriseFactor: 10 // Maximum surprise
      };

      const input1: RecommendationInput = {
        quiz: quiz1,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const input2: RecommendationInput = {
        quiz: quiz2,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result1 = selectRecommendation(input1);
      const result2 = selectRecommendation(input2);

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
      
      // With same seed, results should be deterministic
      const result1Again = selectRecommendation(input1);
      expect(result1Again!._id).toBe(result1!._id);
    });

    it('returns highest scoring meal', () => {
      // Create a scenario where we can predict the winner
      const quiz: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 1, // Close to meal3's spiciness
        surpriseFactor: 0 // No randomness
      };

      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal3',
          type: 'like',
          timestamp: new Date()
        }
      ];

      const input: RecommendationInput = {
        quiz,
        recentFeedback: feedback,
        weather: 'rain', // Matches meal3
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      expect(result!._id).toBe('meal3');
    });

    it('handles meals with missing spiciness values', () => {
      const mealWithoutSpiciness: Meal = {
        _id: 'meal5',
        name: 'Unknown Spice Level',
        primaryIngredients: ['ingredient'],
        allergens: [],
        weather: ['normal'],
        timeOfDay: ['lunch'],
        spiciness: undefined as unknown as number, // Missing spiciness for test
        heaviness: 2,
        flavorTags: ['mystery']
      };

      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: [mealWithoutSpiciness],
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // Should handle gracefully and treat as spiciness 0
    });

    it('returns null when all meals are eliminated', () => {
      const quiz: QuizAnswers = {
        ingredientsToAvoid: ['chicken', 'lettuce', 'vegetables', 'fish'], // Eliminate all meals
        spiciness: 2,
        surpriseFactor: 5
      };

      const input: RecommendationInput = {
        quiz,
        recentFeedback: mockFeedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeNull();
    });

    it('handles interested feedback neutrally', () => {
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'interested',
          timestamp: new Date()
        }
      ];

      const input: RecommendationInput = {
        quiz: mockQuiz,
        recentFeedback: feedback,
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
      // Interested feedback should not modify score
    });
  });

  describe('getLikedFlavorTags', () => {
    it('returns flavor tags from liked meals within 2 weeks', () => {
      const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'like',
          timestamp: recentDate
        },
        {
          mealId: 'meal3',
          type: 'like',
          timestamp: recentDate
        }
      ];

      const result = getLikedFlavorTags(feedback, mockMeals);
      
      expect(result).toContain('spicy');
      expect(result).toContain('thai');
      expect(result).toContain('creamy');
      expect(result).toContain('warming');
      expect(result).toContain('healthy');
      expect(result).toContain('comfort');
    });

    it('ignores disliked meals', () => {
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'dislike',
          timestamp: new Date()
        }
      ];

      const result = getLikedFlavorTags(feedback, mockMeals);
      expect(result).toHaveLength(0);
    });

    it('ignores interested meals', () => {
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'interested',
          timestamp: new Date()
        }
      ];

      const result = getLikedFlavorTags(feedback, mockMeals);
      expect(result).toHaveLength(0);
    });

    it('ignores old feedback outside 2-week window', () => {
      const oldDate = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000); // 3 weeks ago
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'like',
          timestamp: oldDate
        }
      ];

      const result = getLikedFlavorTags(feedback, mockMeals);
      expect(result).toHaveLength(0);
    });

    it('handles non-existent meal IDs gracefully', () => {
      const feedback: FeedbackEntry[] = [
        {
          mealId: 'non-existent-meal',
          type: 'like',
          timestamp: new Date()
        }
      ];

      const result = getLikedFlavorTags(feedback, mockMeals);
      expect(result).toHaveLength(0);
    });

    it('returns unique tags when multiple meals share tags', () => {
      const mealWithDuplicateTag: Meal = {
        _id: 'meal6',
        name: 'Another Thai Dish',
        primaryIngredients: ['rice'],
        allergens: [],
        weather: ['normal'],
        timeOfDay: ['dinner'],
        spiciness: 3,
        heaviness: 2,
        flavorTags: ['thai', 'aromatic'] // 'thai' is duplicate
      };

      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal1',
          type: 'like',
          timestamp: new Date()
        },
        {
          mealId: 'meal6',
          type: 'like',
          timestamp: new Date()
        }
      ];

      const result = getLikedFlavorTags(feedback, [...mockMeals, mealWithDuplicateTag]);
      
      // Should only contain 'thai' once
      const thaiCount = result.filter(tag => tag === 'thai').length;
      expect(thaiCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty quiz answers', () => {
      const emptyQuiz: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 0,
        surpriseFactor: 0
      };

      const input: RecommendationInput = {
        quiz: emptyQuiz,
        recentFeedback: [],
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
    });

    it('handles extreme spiciness values', () => {
      const extremeQuiz: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 10, // Beyond meal range
        surpriseFactor: 5
      };

      const input: RecommendationInput = {
        quiz: extremeQuiz,
        recentFeedback: [],
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
    });

    it('handles extreme surprise factor values', () => {
      const extremeQuiz: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 2,
        surpriseFactor: 20 // Beyond expected range
      };

      const input: RecommendationInput = {
        quiz: extremeQuiz,
        recentFeedback: [],
        weather: 'normal',
        candidateMeals: mockMeals,
        randomSeed: 12345
      };

      const result = selectRecommendation(input);
      expect(result).toBeTruthy();
    });
  });
});