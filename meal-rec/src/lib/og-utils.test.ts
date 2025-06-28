// ABOUTME: Tests for Open Graph utility functions
// ABOUTME: Validates metadata generation for meals and pages

import { generateMealOGMetadata, generatePageOGMetadata } from './og-utils';

describe('OG Utils', () => {
  describe('generateMealOGMetadata', () => {
    it('should generate basic meal metadata', () => {
      const meal = {
        name: 'Spicy Pad Thai',
        description: 'Delicious Thai noodles with shrimp',
        cuisine: 'Thai',
        spiciness: 3
      };

      const metadata = generateMealOGMetadata(meal);

      expect(metadata.title).toBe('Spicy Pad Thai | MealRec');
      expect(metadata.description).toBe('Delicious Thai noodles with shrimp - Thai cuisine');
      expect(metadata.openGraph?.title).toBe('Spicy Pad Thai | MealRec');
      expect(metadata.openGraph?.type).toBe('article');
      expect(metadata.openGraph?.url).toBe('https://mealrec.app');
    });

    it('should use custom URL when provided', () => {
      const meal = { name: 'Test Meal' };
      const customUrl = 'https://mealrec.app/meals/test-meal';

      const metadata = generateMealOGMetadata(meal, customUrl);

      expect(metadata.openGraph?.url).toBe(customUrl);
    });

    it('should use custom image when provided', () => {
      const meal = {
        name: 'Test Meal',
        imageUrl: 'https://example.com/meal.jpg'
      };

      const metadata = generateMealOGMetadata(meal);

      expect(metadata.openGraph?.images?.[0]).toEqual({
        url: 'https://example.com/meal.jpg',
        width: 1200,
        height: 630,
        alt: 'Test Meal - MealRec',
      });
    });

    it('should fall back to default image when no image provided', () => {
      const meal = { name: 'Test Meal' };

      const metadata = generateMealOGMetadata(meal);

      expect(metadata.openGraph?.images?.[0]).toEqual({
        url: '/og-default-meal.jpg',
        width: 1200,
        height: 630,
        alt: 'Test Meal - MealRec',
      });
    });

    it('should generate description when none provided', () => {
      const meal = { name: 'Test Meal', cuisine: 'Italian' };

      const metadata = generateMealOGMetadata(meal);

      expect(metadata.description).toBe('Discover Test Meal and get personalized meal recommendations on MealRec');
    });

    it('should handle meal without cuisine', () => {
      const meal = {
        name: 'Test Meal',
        description: 'A tasty dish'
      };

      const metadata = generateMealOGMetadata(meal);

      expect(metadata.description).toBe('A tasty dish');
    });
  });

  describe('generatePageOGMetadata', () => {
    it('should generate basic page metadata', () => {
      const metadata = generatePageOGMetadata(
        'About Us',
        'Learn more about MealRec'
      );

      expect(metadata.title).toBe('About Us | MealRec');
      expect(metadata.description).toBe('Learn more about MealRec');
      expect(metadata.openGraph?.type).toBe('website');
      expect(metadata.openGraph?.url).toBe('https://mealrec.app');
    });

    it('should not double-append MealRec to title', () => {
      const metadata = generatePageOGMetadata(
        'MealRec Dashboard',
        'Your personal meal dashboard'
      );

      expect(metadata.title).toBe('MealRec Dashboard');
    });

    it('should use custom URL and image when provided', () => {
      const customUrl = 'https://mealrec.app/about';
      const customImage = 'https://example.com/about.jpg';

      const metadata = generatePageOGMetadata(
        'About',
        'About page',
        customUrl,
        customImage
      );

      expect(metadata.openGraph?.url).toBe(customUrl);
      expect(metadata.openGraph?.images?.[0].url).toBe(customImage);
    });

    it('should have consistent Twitter and OpenGraph data', () => {
      const metadata = generatePageOGMetadata(
        'Test Page',
        'Test description'
      );

      expect(metadata.twitter?.title).toBe(metadata.openGraph?.title);
      expect(metadata.twitter?.description).toBe(metadata.openGraph?.description);
      expect(metadata.twitter?.images?.[0]).toBe(metadata.openGraph?.images?.[0].url);
    });
  });
});