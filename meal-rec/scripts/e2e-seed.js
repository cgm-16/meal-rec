// ABOUTME: E2E test database seeding script for isolated test data
// ABOUTME: Seeds minimal test data directly to the E2E test database

const mongoose = require('mongoose');

// Simple meal schema for seeding (matches the main schema)
const MealSchema = new mongoose.Schema({
  name: String,
  cuisine: String,
  primaryIngredients: [String],
  allergens: [String],
  weather: [String],
  timeOfDay: [String],
  spiciness: Number,
  heaviness: Number,
  imageUrl: String,
  description: String,
  flavorTags: [String],
}, { timestamps: true });

const Meal = mongoose.model('Meal', MealSchema);

// Minimal test data for E2E tests
const testMeals = [
  {
    name: "E2E Test Pasta",
    cuisine: "Italian",
    primaryIngredients: ["pasta", "tomato", "basil"],
    allergens: ["gluten"],
    weather: ["any"],
    timeOfDay: ["dinner"],
    spiciness: 2,
    heaviness: 3,
    imageUrl: "/test-meal.jpg",
    description: "A test pasta dish for E2E testing",
    flavorTags: ["savory", "herby"]
  },
  {
    name: "E2E Test Salad",
    cuisine: "Mediterranean",
    primaryIngredients: ["lettuce", "tomato", "cucumber"],
    allergens: [],
    weather: ["hot"],
    timeOfDay: ["lunch"],
    spiciness: 0,
    heaviness: 1,
    imageUrl: "/test-salad.jpg",
    description: "A light test salad for E2E testing",
    flavorTags: ["fresh", "light"]
  },
  {
    name: "E2E Test Curry",
    cuisine: "Indian",
    primaryIngredients: ["rice", "curry", "vegetables"],
    allergens: [],
    weather: ["cold"],
    timeOfDay: ["dinner"],
    spiciness: 3,
    heaviness: 2,
    imageUrl: "/test-curry.jpg",
    description: "A flavorful test curry for E2E testing",
    flavorTags: ["spicy", "aromatic"]
  }
];

async function seedE2EDatabase() {
  try {
    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/meal-rec-e2e-test';
    
    console.log(`Connecting to E2E test database: ${mongoUrl}`);
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    // Clear existing data
    await Meal.deleteMany({});
    console.log('Cleared existing test meals');

    // Insert test data
    await Meal.insertMany(testMeals);
    console.log(`Seeded ${testMeals.length} test meals for E2E testing`);

    await mongoose.disconnect();
    console.log('E2E database seeding completed successfully');
    
  } catch (error) {
    console.error('E2E database seeding failed:', error);
    process.exit(1);
  }
}

seedE2EDatabase();