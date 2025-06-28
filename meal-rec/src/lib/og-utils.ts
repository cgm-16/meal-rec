// ABOUTME: Open Graph utilities for generating dynamic meta tags
// ABOUTME: Provides functions to create meal-specific Open Graph metadata

import type { Metadata } from 'next';

export interface MealOGData {
  name: string;
  description?: string;
  imageUrl?: string;
  cuisine?: string;
  spiciness?: number;
}

export function generateMealOGMetadata(meal: MealOGData, currentUrl?: string): Metadata {
  const title = `${meal.name} | MealRec`;
  const description = meal.description 
    ? `${meal.description} ${meal.cuisine ? `- ${meal.cuisine} cuisine` : ''}`.trim()
    : `Discover ${meal.name} and get personalized meal recommendations on MealRec`;
  
  const imageUrl = meal.imageUrl || '/og-default-meal.jpg';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: currentUrl || 'https://mealrec.app',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${meal.name} - MealRec`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function generatePageOGMetadata(
  title: string,
  description: string,
  currentUrl?: string,
  imageUrl?: string
): Metadata {
  const fullTitle = title.includes('MealRec') ? title : `${title} | MealRec`;
  const ogImageUrl = imageUrl || '/og-default-meal.jpg';

  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      type: 'website',
      url: currentUrl || 'https://mealrec.app',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImageUrl],
    },
  };
}