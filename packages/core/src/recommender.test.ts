// ABOUTME: Comprehensive tests for recommendation engine with deterministic random seed
// ABOUTME: Tests scoring algorithm, edge cases, and all business rules

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMealEligible, scoreMealDeterministically, type WeatherCondition } from './index';
import { selectRecommendation, SeededRandom, type QuizAnswers, type FeedbackEntry, type Meal, type RecommendationInput, type ScoredMeal } from './recommender';

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

      // Should favor meals with lower spiciness
      const counts = new Map<string, number>();
      for (let seed = 0; seed < 400; seed++) {
        const result = selectRecommendation({
          quiz,
          recentFeedback: mockFeedback,
          weather: 'normal',
          candidateMeals: mockMeals,
          randomSeed: seed
        });
        counts.set(result!._id, (counts.get(result!._id) ?? 0) + 1);
      }
      // meal2 (spiciness 0) should beat meal1 (spiciness 4)
      expect(counts.get('meal2') ?? 0).toBeGreaterThan(counts.get('meal1') ?? 0);
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

    it('favours the highest scoring meal without always returning it', () => {
      const quiz: QuizAnswers = {
        ingredientsToAvoid: [],
        spiciness: 1, // Close to meal3's spiciness
        surpriseFactor: 0 // No score noise
      };

      const feedback: FeedbackEntry[] = [
        {
          mealId: 'meal3',
          type: 'like',
          timestamp: new Date()
        }
      ];

      const counts = new Map<string, number>();
      for (let seed = 0; seed < 200; seed++) {
        const result = selectRecommendation({
          quiz,
          recentFeedback: feedback,
          weather: 'rain', // Matches meal3
          candidateMeals: mockMeals,
          randomSeed: seed
        });
        counts.set(result!._id, (counts.get(result!._id) ?? 0) + 1);
      }

      const liked = counts.get('meal3')!;
      expect(liked).toBeLessThan(200);
      for (const [mealId, count] of counts) {
        if (mealId !== 'meal3') expect(liked).toBeGreaterThan(count);
      }
    });

    it('returns varied meals across repeated unseeded calls with identical input', () => {
      const quiz: QuizAnswers = { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 };
      const ids = new Set<string>();
      for (let call = 0; call < 100; call++) {
        ids.add(selectRecommendation({
          quiz,
          recentFeedback: [],
          weather: 'normal',
          candidateMeals: mockMeals
        })!._id);
      }
      expect(ids.size).toBeGreaterThan(1);
    });

    it('only samples from the top-scoring meals', () => {
      const topMeals = Array.from({ length: 5 }, (_, i) => ({
        ...mockMeals[2], _id: `top${i}`, spiciness: 2, weather: ['rain']
      }));
      const lowMeals = Array.from({ length: 15 }, (_, i) => ({
        ...mockMeals[2], _id: `low${i}`, spiciness: 5, weather: ['hot']
      }));
      const quiz: QuizAnswers = { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 };
      // top: 1 + 0.2 weather = 1.2; low: 1 - 0.05 * 3 spiciness = 0.85
      for (let seed = 0; seed < 100; seed++) {
        const result = selectRecommendation({
          quiz,
          recentFeedback: [],
          weather: 'rain',
          candidateMeals: [...lowMeals, ...topMeals],
          randomSeed: seed
        });
        expect(result!._id).toMatch(/^top/);
      }
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

  describe('attribute similarity from feedback', () => {
    // Disliked/liked meal that is NOT among the candidates; only its attributes are known
    const reviewedMeal = { cuisine: 'Thai', heaviness: 3, spiciness: 4 };
    const baseMeal: Meal = {
      _id: '', name: 'Candidate', primaryIngredients: [], allergens: [], weather: [],
      timeOfDay: ['dinner'], spiciness: 0, heaviness: 0, flavorTags: []
    };
    const twin: Meal = { ...baseMeal, _id: 'twin', ...reviewedMeal };
    const unrelated: Meal = { ...baseMeal, _id: 'unrelated', cuisine: 'Italian', heaviness: 0, spiciness: 0 };
    const scoreOf = (candidate: Meal, type: FeedbackEntry['type']) =>
      (selectRecommendation({
        quiz: { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 },
        recentFeedback: [{ mealId: 'reviewed', type, timestamp: new Date(), meal: reviewedMeal }],
        weather: 'normal',
        candidateMeals: [candidate],
        randomSeed: 1
      }) as ScoredMeal).scoreBreakdown.attributeSimilarity;

    it('lowers the score of meals similar to a disliked meal', () => {
      expect(scoreOf(twin, 'dislike')).toBeLessThan(0);
      expect(scoreOf(unrelated, 'dislike')).toBe(0);
    });

    it('raises the score of meals similar to a liked meal', () => {
      expect(scoreOf(twin, 'like')).toBeGreaterThan(0);
      expect(scoreOf(unrelated, 'like')).toBe(0);
    });

    it('treats missing heaviness and spiciness as 0 when comparing meals', () => {
      // Stored meals can lack these fields even though the type requires them
      const sparse = { ...baseMeal, _id: 'sparse' } as Partial<Meal> as Meal;
      delete (sparse as Partial<Meal>).heaviness;
      delete (sparse as Partial<Meal>).spiciness;
      const result = selectRecommendation({
        quiz: { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 },
        recentFeedback: [{ mealId: 'reviewed', type: 'dislike', timestamp: new Date(), meal: { cuisine: 'Thai' } as NonNullable<FeedbackEntry['meal']> }],
        weather: 'normal',
        candidateMeals: [sparse],
        randomSeed: 1
      }) as ScoredMeal;
      // heaviness 0 vs 0 and spiciness 0 vs 0 are both within 1: 0.5 similarity, scaled by -0.2
      expect(result.scoreBreakdown.attributeSimilarity).toBeCloseTo(-0.1);
    });

    it('ignores interested feedback', () => {
      expect(scoreOf(twin, 'interested')).toBe(0);
    });

    it('stays smaller than the exact-meal feedback term so it cannot swamp it', () => {
      expect(Math.abs(scoreOf(twin, 'dislike'))).toBeLessThan(0.4);
      expect(scoreOf(twin, 'like')).toBeLessThan(0.4);
    });

    it('prefers an unrelated meal over the twin of a disliked meal', () => {
      const counts = { twin: 0, unrelated: 0 };
      for (let seed = 0; seed < 400; seed++) {
        const result = selectRecommendation({
          quiz: { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 },
          recentFeedback: [{ mealId: 'reviewed', type: 'dislike', timestamp: new Date(), meal: reviewedMeal }],
          weather: 'normal',
          candidateMeals: [twin, unrelated],
          randomSeed: seed
        });
        counts[result!._id as 'twin' | 'unrelated']++;
      }
      expect(counts.unrelated).toBeGreaterThan(counts.twin * 1.15);
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
describe('SeededRandom', () => {
  const draw = (seed: number, count: number) => {
    const random = new SeededRandom(seed);
    return Array.from({ length: count }, () => random.next());
  };

  it('is deterministic for a given seed', () => {
    expect(draw(12345, 20)).toEqual(draw(12345, 20));
  });

  it('produces independent streams for seeds that share a residue mod 233280', () => {
    const seed = 1_700_000_000_000;
    expect(draw(seed, 5)).not.toEqual(draw(seed + 233280, 5));
  });

  it('produces uniform values in [0, 1) from a Date.now()-sized seed', () => {
    const values = draw(1_700_000_000_000, 10000);
    expect(values.every(value => value >= 0 && value < 1)).toBe(true);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    expect(new Set(values).size).toBeGreaterThan(9900);
  });
});

describe('ingredient exclusion against seed data', () => {
  const seedMeals: Meal[] = JSON.parse(
    readFileSync(resolve(__dirname, '../../../data/meals.json'), 'utf8')
  ).map((meal: Omit<Meal, '_id'>, index: number) => ({ ...meal, _id: `seed${index}` }));
  const mealsNamed = (...names: string[]) => seedMeals.filter(meal => names.includes(meal.name));

  it.each([
    ['nuts', ['Pad Thai', 'Massaman Curry', 'Satay', 'Tagine', 'Acai Bowl']],
    ['eggs', ['Khao Soi']],
    ['onions', ['Ceviche', 'Boeuf Bourguignon']]
  ])('excluding %s removes meals that list it under another name', (avoided, names) => {
    const candidates = mealsNamed(...names);
    expect(candidates).toHaveLength(names.length);
    expect(selectRecommendation({
      quiz: { ingredientsToAvoid: [avoided], spiciness: 2, surpriseFactor: 0 },
      recentFeedback: [],
      weather: 'normal',
      candidateMeals: candidates,
      randomSeed: 1
    })).toBeNull();
  });

  // Quiz options from meal-rec/src/app/quiz/page.tsx
  it.each(['nuts', 'shellfish', 'dairy', 'eggs', 'soy', 'gluten', 'fish', 'sesame', 'mushrooms', 'onions'])(
    'excluding %s removes every seed meal that mentions it',
    (avoided) => {
      const stem = avoided.replace(/s$/, '');
      // Words that contain the stem but are a different ingredient
      const lookalikes: Record<string, string[]> = { nuts: ['coconut'], eggs: ['eggplant'], fish: ['shellfish'] };
      const mentions = (item: string) =>
        item.includes(stem) && !(lookalikes[avoided] ?? []).some(lookalike => item.includes(lookalike));
      const candidates = seedMeals.filter(meal => [...meal.primaryIngredients, ...meal.allergens].some(mentions));
      expect(candidates.length).toBeGreaterThan(0);
      expect(selectRecommendation({
        quiz: { ingredientsToAvoid: [avoided], spiciness: 2, surpriseFactor: 0 },
        recentFeedback: [],
        weather: 'normal',
        candidateMeals: candidates,
        randomSeed: 1
      })).toBeNull();
    }
  );
});


describe('pinned deterministic heuristic', () => {
  const asOf = new Date('2026-01-15T12:00:00.000Z');
  const base: Meal = {
    _id: 'candidate', name: 'Candidate', primaryIngredients: [], allergens: [], weather: [],
    timeOfDay: ['lunch'], spiciness: 2, heaviness: 2, flavorTags: [], cuisine: 'Korean'
  };
  const quiz: QuizAnswers = { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 };
  const examples: { vectors: Array<{
    name: string; asOf: string; meal: Meal; quiz: QuizAnswers; weather: WeatherCondition;
    recentFeedback: Array<Omit<FeedbackEntry, 'timestamp'> & { timestamp: string }>;
    expectedScore: number; expectedBreakdown: ScoredMeal['scoreBreakdown'];
  }> } = JSON.parse(readFileSync(resolve(__dirname, '../../../contracts/meal-prediction/heuristic-v1.example.json'), 'utf8'));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(examples.vectors)('matches the shared core score vector: $name', vector => {
    const feedback = vector.recentFeedback.map(entry => ({ ...entry, timestamp: new Date(entry.timestamp) }));
    // The reference clock is explicit and surprise never enters its score.
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const result = scoreMealDeterministically(vector.meal, { ...vector.quiz, surpriseFactor: 10 }, feedback, vector.weather, new Date(vector.asOf));
    expect(result.score).toBeCloseTo(vector.expectedScore, 14);
    for (const key of Object.keys(vector.expectedBreakdown) as Array<keyof ScoredMeal['scoreBreakdown']>) {
      expect(result.scoreBreakdown[key]).toBeCloseTo(vector.expectedBreakdown[key], 14);
    }
  });

  it.each([
    ['nuts', 'peanut sauce'], ['nuts', 'peanuts'], ['nuts', 'tree nuts'],
    ['eggs', 'egg noodles'], ['onions', 'pearl onions'], ['onions', 'onion'], ['dairy', 'dairy']
  ])('excludes %s from both primary ingredients and allergens via %s', (avoided, ingredient) => {
    expect(isMealEligible({ primaryIngredients: [ingredient], allergens: [] }, [avoided])).toBe(false);
    expect(isMealEligible({ primaryIngredients: [], allergens: [ingredient] }, [avoided])).toBe(false);
  });

  it('retains exact matching rather than excluding lookalike ingredients', () => {
    expect(isMealEligible({ primaryIngredients: ['coconut', 'eggplant', 'shellfish'], allergens: [] }, ['nuts', 'eggs', 'fish'])).toBe(true);
    expect(isMealEligible(base, [])).toBe(true);
  });

  it('preserves legacy input-order feedback and its lack of a future cutoff', () => {
    const future: FeedbackEntry = { mealId: base._id, type: 'like', timestamp: new Date('2026-02-01T00:00:00Z'), meal: base };
    const older: FeedbackEntry = { ...future, type: 'dislike', timestamp: new Date('2026-01-14T00:00:00Z') };
    const score = (recentFeedback: FeedbackEntry[]) => (selectRecommendation({
      quiz, recentFeedback, weather: 'normal', candidateMeals: [base], randomSeed: 42
    }) as ScoredMeal).score;
    expect(score([future])).toBe(1.4);
    expect(score([future, older])).toBe(0.6);
    expect(score([older, { ...future, type: 'interested' }])).toBe(1);
  });

  it.each([
    [0, 0, 'similar', 1.05], [0, 1, 'similar', 1.05], [0, 2, 'similar', 1.05],
    [0, 42, 'liked', 1.5999999999999999], [0, 12345, 'liked', 1.5999999999999999],
    [10, 0, 'normal', 0.9915110185043885], [10, 1, 'plain', 1.2218670481641312],
    [10, 2, 'normal', 1.4096701456874141], [10, 42, 'liked', 1.7617660030722617],
    [10, 12345, 'liked', 2.3675652284175155]
  ])('preserves seeded selection and RNG draw order with surprise %s seed %s', (surpriseFactor, randomSeed, identity, score) => {
    const candidates: Meal[] = [
      { ...base, _id: 'blocked', primaryIngredients: ['peanut sauce'] },
      { ...base, _id: 'liked', weather: ['rain'] },
      { ...base, _id: 'similar', spiciness: 3 },
      { ...base, _id: 'disliked', cuisine: 'Italian', spiciness: 0, heaviness: 4 },
      { ...base, _id: 'plain', cuisine: 'Thai', spiciness: 5, heaviness: 5 },
      { ...base, _id: 'normal', weather: ['normal'], spiciness: 1 },
      { ...base, _id: 'extra', weather: ['rain'], spiciness: 4 }
    ];
    const draw = vi.spyOn(SeededRandom.prototype, 'next');
    const result = selectRecommendation({
      quiz: { ...quiz, ingredientsToAvoid: ['nuts'], surpriseFactor },
      recentFeedback: [
        { mealId: 'liked', type: 'like', timestamp: new Date('2026-01-14T10:00:00Z'), meal: base },
        { mealId: 'disliked', type: 'dislike', timestamp: new Date('2026-01-14T11:00:00Z'), meal: candidates[3] }
      ],
      weather: 'rain', candidateMeals: candidates, randomSeed
    }) as ScoredMeal;
    expect(result._id).toBe(identity);
    expect(result.score).toBe(score);
    // Each eligible meal draws once even with zero surprise, then sampling draws once.
    expect(draw).toHaveBeenCalledTimes(7);
  });
});
