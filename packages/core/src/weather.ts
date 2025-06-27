// ABOUTME: Weather utility module for retrieving current weather conditions
// ABOUTME: Uses Open-Meteo API with memory caching for 10-minute TTL

import type { WeatherCondition } from './recommender';

interface WeatherCache {
  data: WeatherCondition;
  timestamp: number;
}

interface OpenMeteoResponse {
  current_weather: {
    temperature: number;
    weathercode: number;
  };
}

const weatherCache = new Map<string, WeatherCache>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get current weather condition for given coordinates
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns Weather condition string
 */
export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherCondition> {
  const cacheKey = `${lat},${lon}`;
  const cached = weatherCache.get(cacheKey);
  
  // Return cached result if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as OpenMeteoResponse;
    const { temperature, weathercode } = data.current_weather;
    
    const condition = classifyWeather(temperature, weathercode);
    
    // Cache the result
    weatherCache.set(cacheKey, {
      data: condition,
      timestamp: Date.now()
    });
    
    return condition;
  } catch (error) {
    console.warn('Failed to fetch weather data:', error);
    return 'normal';
  }
}

/**
 * Classify weather based on temperature and weather code
 * @param temperature - Temperature in Celsius
 * @param weathercode - WMO weather code
 * @returns Weather condition
 */
function classifyWeather(temperature: number, weathercode: number): WeatherCondition {
  // Check for rain/precipitation first (weather codes 50-99)
  if (weathercode >= 50 && weathercode <= 99) {
    return 'rain';
  }
  
  // Temperature-based classification
  if (temperature <= 10) {
    return 'cold';
  } else if (temperature >= 28) {
    return 'hot';
  }
  
  return 'normal';
}

/**
 * Clear weather cache (useful for testing)
 */
export function clearWeatherCache(): void {
  weatherCache.clear();
}