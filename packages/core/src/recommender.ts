// ABOUTME: Pure TypeScript recommendation engine for meal selection
// ABOUTME: Scores meals on quiz answers, feedback, and weather, then samples from the top scorers

export interface QuizAnswers {
  ingredientsToAvoid: string[];
  spiciness: number; // 0-5
  surpriseFactor: number; // 0-10
}

export interface FeedbackEntry {
  mealId: string;
  type: 'like' | 'interested' | 'dislike';
  timestamp: Date;
  // Attributes of the reviewed meal, so feedback generalises to similar meals
  meal?: Pick<Meal, 'cuisine' | 'heaviness' | 'spiciness'>;
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
    attributeSimilarity: number;
    spicinessDistance: number;
    weatherMatch: number;
    surpriseFactor: number;
    finalScore: number;
  };
}

// Deterministic random number generator for testing
// mulberry32: all state arithmetic stays within 32-bit integers, so any seed size is safe
export class SeededRandom {
  private state: number;

  constructor(seed: number = Math.random() * 4294967296) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// Number of best-scoring meals the final pick is sampled from
const TOP_K_SAMPLE_SIZE = 5;

// Largest score change from attribute similarity; kept below the 0.4 exact-meal feedback term
const MAX_ATTRIBUTE_SIMILARITY_BONUS = 0.2;

// Similarity in [0, 1] from coarse attributes; flavour tags are too sparse to compare meals
function attributeSimilarity(a: Pick<Meal, 'cuisine' | 'heaviness' | 'spiciness'>, b: Pick<Meal, 'cuisine' | 'heaviness' | 'spiciness'>): number {
  let similarity = 0;
  if (a.cuisine && a.cuisine === b.cuisine) similarity += 0.5;
  if (Math.abs((a.heaviness ?? 0) - (b.heaviness ?? 0)) <= 1) similarity += 0.25;
  if (Math.abs((a.spiciness ?? 0) - (b.spiciness ?? 0)) <= 1) similarity += 0.25;
  return similarity;
}

// Mean signed similarity to liked (+) and disliked (-) meals, scaled to the bonus cap
function attributeSimilarityBonus(
  meal: Meal,
  ratedMeals: Array<FeedbackEntry & { meal: NonNullable<FeedbackEntry['meal']> }>
): number {
  const others = ratedMeals.filter(feedback => feedback.mealId !== meal._id);
  if (others.length === 0) return 0;
  const total = others.reduce(
    (sum, feedback) => sum + (feedback.type === 'like' ? 1 : -1) * attributeSimilarity(meal, feedback.meal),
    0
  );
  return MAX_ATTRIBUTE_SIMILARITY_BONUS * total / others.length;
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

  const ratedMeals = [...feedbackMap.values()].filter(
    (feedback): feedback is FeedbackEntry & { meal: NonNullable<FeedbackEntry['meal']> } =>
      feedback.type !== 'interested' && feedback.meal !== undefined
  );

  // Score each meal
  const scoredMeals: ScoredMeal[] = candidateMeals.map(meal => {
    const scoreBreakdown = {
      base: 1.0,
      feedbackBonus: 0,
      attributeSimilarity: 0,
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

    // Generalise likes/dislikes to meals sharing coarse attributes
    scoreBreakdown.attributeSimilarity = attributeSimilarityBonus(meal, ratedMeals);
    score += scoreBreakdown.attributeSimilarity;

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

  // Sample from the top-scoring meals weighted by score, so the best match is
  // favoured without being returned on every call
  validMeals.sort((a, b) => b.score - a.score);
  const topMeals = validMeals.slice(0, TOP_K_SAMPLE_SIZE);
  const totalScore = topMeals.reduce((sum, meal) => sum + meal.score, 0);
  let pick = random.next() * totalScore;
  for (const meal of topMeals) {
    pick -= meal.score;
    if (pick < 0) {
      return meal;
    }
  }
  return topMeals[topMeals.length - 1];
}