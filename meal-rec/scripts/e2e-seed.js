// ABOUTME: E2E test database seeding script for isolated test data
// ABOUTME: Seeds minimal test data directly to the E2E test database

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

// User schema for seeding
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  hashedPin: { type: String, required: true },
  role: { type: String, enum: ['user'], default: 'user' },
  banned: { type: Boolean, default: false },
  preferences: {
    spiciness: { type: Number, min: 0, max: 5 },
    surpriseFactor: { type: Number, min: 0, max: 10 },
    ingredientsToAvoid: [String]
  }
}, { timestamps: true });

// Feedback schema for seeding
const FeedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  meal: { type: mongoose.Schema.Types.ObjectId, ref: 'Meal', required: true },
  type: { type: String, enum: ['like', 'interested', 'dislike'], required: true },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

FeedbackSchema.index({ user: 1, meal: 1 }, { unique: true });

const Meal = mongoose.model('Meal', MealSchema);
const User = mongoose.model('User', UserSchema);
const Feedback = mongoose.model('Feedback', FeedbackSchema);

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

// Test users for feedback data
const testUsers = [
  {
    username: 'e2e-test-user1',
    hashedPin: '', // Will be populated with hashed PIN
    role: 'user'
  },
  {
    username: 'e2e-test-user2', 
    hashedPin: '', // Will be populated with hashed PIN
    role: 'user'
  },
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
    await User.deleteMany({});
    await Feedback.deleteMany({});
    console.log('Cleared existing test data');

    // Hash PINs for test users
    for (const user of testUsers) {
      user.hashedPin = await bcrypt.hash('1234', 10);
    }

    // Insert test data
    const insertedMeals = await Meal.insertMany(testMeals);
    console.log(`Seeded ${insertedMeals.length} test meals for E2E testing`);

    const insertedUsers = await User.insertMany(testUsers);
    console.log(`Seeded ${insertedUsers.length} test users for E2E testing`);

    // Create feedback data for analytics
    const feedbackData = [];
    
    // Create various feedback combinations to populate analytics
    // Pasta gets lots of likes
    feedbackData.push(
      { user: insertedUsers[0]._id, meal: insertedMeals[0]._id, type: 'like' },
      { user: insertedUsers[1]._id, meal: insertedMeals[0]._id, type: 'like' }
    );
    
    // Salad gets mixed feedback
    feedbackData.push(
      { user: insertedUsers[0]._id, meal: insertedMeals[1]._id, type: 'interested' },
      { user: insertedUsers[1]._id, meal: insertedMeals[1]._id, type: 'like' }
    );
    
    // Curry gets some dislikes
    feedbackData.push(
      { user: insertedUsers[0]._id, meal: insertedMeals[2]._id, type: 'dislike' },
      { user: insertedUsers[1]._id, meal: insertedMeals[2]._id, type: 'interested' }
    );

    const insertedFeedback = await Feedback.insertMany(feedbackData);
    console.log(`Seeded ${insertedFeedback.length} feedback entries for analytics testing`);

    await mongoose.disconnect();
    console.log('E2E database seeding completed successfully');
    
  } catch (error) {
    console.error('E2E database seeding failed:', error);
    process.exit(1);
  }
}

seedE2EDatabase();