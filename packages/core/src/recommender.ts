// ABOUTME: Pure TypeScript recommendation engine for meal selection
// ABOUTME: Implements scoring algorithm based on quiz answers, feedback, and weather

export interface QuizAnswers {
  ingredientsToAvoid: string[];
  spiciness: number; // 0-5
  surpriseFactor: number; // 0-10
}

export interface FeedbackEntry {
  mealId: string;
  type: 'like' | 'interested' | 'dislike';
  timestamp: Date;
}

export interface Meal {
  _id: string;
  name: string;
  primaryIngredients: string[];
  allergens: string[];
  weather: string[]; // e.g., "cold", "hot", "rain"
  timeOfDay: string[]; // "breakfast", "lunch", "dinner"
  spiciness: number; // 0-5
  heaviness: number; // 0-5
  flavorTags: string[];
  imageUrl?: string;
  description?: string;
  cuisine?: string;
}

export type WeatherCondition = 'cold' | 'hot' | 'rain' | 'normal';

export interface RecommendationInput {
  quiz: QuizAnswers;
  recentFeedback: FeedbackEntry[];
  weather: WeatherCondition;
  candidateMeals: Meal[];
  randomSeed?: number; // For deterministic testing
}

export interface ScoredMeal extends Meal {
  score: number;
  scoreBreakdown: {
    base: number;
    feedbackBonus: number;
    spicinessDistance: number;
    weatherMatch: number;
    surpriseFactor: number;
    finalScore: number;
  };
}

// Deterministic random number generator for testing
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export function selectRecommendation(input: RecommendationInput): Meal | null {
  const { quiz, recentFeedback, weather, candidateMeals, randomSeed } = input;
  
  if (candidateMeals.length === 0) {
    return null;
  }

  const random = new SeededRandom(randomSeed);
  
  // Create feedback lookup for faster access
  const feedbackMap = new Map<string, FeedbackEntry>();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  for (const feedback of recentFeedback) {
    if (feedback.timestamp >= twoWeeksAgo) {
      feedbackMap.set(feedback.mealId, feedback);
    }
  }

  // Score each meal
  const scoredMeals: ScoredMeal[] = candidateMeals.map(meal => {
    const scoreBreakdown = {
      base: 1.0,
      feedbackBonus: 0,
      spicinessDistance: 0,
      weatherMatch: 0,
      surpriseFactor: 0,
      finalScore: 0
    };

    let score = scoreBreakdown.base;

    // Check for ingredient conflicts
    const hasAvoidedIngredients = quiz.ingredientsToAvoid.some(avoided => 
      meal.primaryIngredients.includes(avoided) || 
      meal.allergens.includes(avoided)
    );
    
    if (hasAvoidedIngredients) {
      score = 0; // Eliminate meals with avoided ingredients
      scoreBreakdown.finalScore = score;
      return { ...meal, score, scoreBreakdown };
    }

    // Feedback bonus/penalty
    const feedback = feedbackMap.get(meal._id);
    if (feedback) {
      if (feedback.type === 'like') {
        scoreBreakdown.feedbackBonus = 0.4;
        score += 0.4;
      } else if (feedback.type === 'dislike') {
        scoreBreakdown.feedbackBonus = -0.4;
        score -= 0.4;
      }
      // 'interested' feedback doesn't change score
    }

    // Spiciness distance penalty
    const spicinessDistance = Math.abs(quiz.spiciness - (meal.spiciness || 0));
    const spicinessDistancePenalty = -0.05 * spicinessDistance;
    scoreBreakdown.spicinessDistance = spicinessDistancePenalty;
    score += spicinessDistancePenalty;

    // Weather match bonus
    if (meal.weather.includes(weather)) {
      scoreBreakdown.weatherMatch = 0.2;
      score += 0.2;
    }

    // Surprise factor
    const surpriseMultiplier = 1 + (quiz.surpriseFactor / 10) * random.range(-0.5, 0.5);
    scoreBreakdown.surpriseFactor = surpriseMultiplier - 1;
    score *= surpriseMultiplier;

    scoreBreakdown.finalScore = score;

    return { ...meal, score, scoreBreakdown };
  });

  // Filter out meals with score <= 0
  const validMeals = scoredMeals.filter(meal => meal.score > 0);
  
  if (validMeals.length === 0) {
    return null;
  }

  // Select the highest scoring meal
  validMeals.sort((a, b) => b.score - a.score);
  
  return validMeals[0];
}

// Helper function to get liked flavor tags from recent feedback
export function getLikedFlavorTags(recentFeedback: FeedbackEntry[], meals: Meal[]): string[] {
  const mealMap = new Map(meals.map(meal => [meal._id, meal]));
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  const likedTags = new Set<string>();
  
  for (const feedback of recentFeedback) {
    if (feedback.timestamp >= twoWeeksAgo && feedback.type === 'like') {
      const meal = mealMap.get(feedback.mealId);
      if (meal) {
        meal.flavorTags.forEach(tag => likedTags.add(tag));
      }
    }
  }
  
  return Array.from(likedTags);
}