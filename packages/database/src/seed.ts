// ABOUTME: Database seeding script for importing meal data from JSON
// ABOUTME: Connects to MongoDB, clears existing meals, and bulk inserts from data/meals.json

import fs from 'fs';
import path from 'path';
import { connect, disconnect } from './connect';
import { Meal } from './models/meal';

async function seed() {
  try {
    // Check for dry-run flag
    const isDryRun = process.argv.includes('--dry-run');
    
    // Read meals data
    const dataPath = path.join(process.cwd(), 'data', 'meals.json');
    
    if (!fs.existsSync(dataPath)) {
      console.log('data/meals.json not found. Skipping seed operation.');
      if (isDryRun) {
        console.log('DRY RUN: Would have seeded meals if data file existed.');
      }
      process.exit(0);
    }

    const mealsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    
    if (isDryRun) {
      console.log(`DRY RUN: Would seed ${mealsData.length} meals to database.`);
      console.log('Sample meal:', JSON.stringify(mealsData[0], null, 2));
      process.exit(0);
    }

    // Connect to database
    console.log('Connecting to database...');
    await connect();

    // Wipe existing Meal collection
    console.log('Clearing existing meals...');
    await Meal.deleteMany({});

    // Bulk insert meals
    console.log(`Inserting ${mealsData.length} meals...`);
    await Meal.insertMany(mealsData);

    console.log('Seed operation completed successfully!');
    
    // Disconnect and exit
    await disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('Seed operation failed:', error);
    process.exit(1);
  }
}

seed();