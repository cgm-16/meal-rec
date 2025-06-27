// ABOUTME: Unit tests for weather utility module with mocked fetch calls
// ABOUTME: Tests weather classification, caching behavior, and error handling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentWeather, clearWeatherCache } from './weather';
import type { WeatherCondition } from './recommender';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockOpenMeteoResponse = {
  current_weather: {
    temperature: 15,
    weathercode: 0
  }
};

describe('Weather Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWeatherCache();
    console.warn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentWeather', () => {
    it('should fetch weather data from Open-Meteo API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenMeteoResponse)
      });

      const result = await getCurrentWeather(40.7128, -74.0060);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&current_weather=true'
      );
      expect(result).toBe('normal');
    });

    it('should classify cold weather correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current_weather: {
            temperature: 5,
            weathercode: 0
          }
        })
      });

      const result = await getCurrentWeather(40.7128, -74.0060);
      expect(result).toBe('cold');
    });

    it('should classify hot weather correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current_weather: {
            temperature: 30,
            weathercode: 0
          }
        })
      });

      const result = await getCurrentWeather(40.7128, -74.0060);
      expect(result).toBe('hot');
    });

    it('should classify rainy weather correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current_weather: {
            temperature: 20,
            weathercode: 61 // Light rain
          }
        })
      });

      const result = await getCurrentWeather(40.7128, -74.0060);
      expect(result).toBe('rain');
    });

    it('should classify normal weather correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current_weather: {
            temperature: 20,
            weathercode: 1 // Clear sky
          }
        })
      });

      const result = await getCurrentWeather(40.7128, -74.0060);
      expect(result).toBe('normal');
    });

    it('should handle edge case temperatures', async () => {
      // Test exactly 10 degrees (should be cold)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current_weather: {
            temperature: 10,
            weathercode: 0
          }
        })
      });

      let result = await getCurrentWeather(40.7128, -74.0060);
      expect(result).toBe('cold');

      clearWeatherCache();

      // Test exactly 28 degrees (should be hot)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          current_weather: {
            temperature: 28,
            weathercode: 0
          }
        })
      });

      result = await getCurrentWeather(40.7128, -74.0060);
      expect(result).toBe('hot');
    });

    it('should handle various rain weather codes', async () => {
      const rainCodes = [51, 61, 71, 80, 95]; // Various precipitation codes

      for (const code of rainCodes) {
        clearWeatherCache();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            current_weather: {
              temperature: 15,
              weathercode: code
            }
          })
        });

        const result = await getCurrentWeather(40.7128, -74.0060);
        expect(result).toBe('rain');
      }
    });
  });

  describe('Caching', () => {
    it('should cache weather data for 10 minutes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenMeteoResponse)
      });

      // First call
      const result1 = await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });

    it('should use different cache entries for different coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenMeteoResponse)
      });

      await getCurrentWeather(40.7128, -74.0060); // NYC
      await getCurrentWeather(34.0522, -118.2437); // LA

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should expire cache after 10 minutes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenMeteoResponse)
      });

      // Mock Date.now to simulate time passing
      const originalNow = Date.now;
      let mockTime = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // First call
      await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time by 9 minutes - should still use cache
      mockTime += 9 * 60 * 1000;
      await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time by 2 more minutes (total 11 minutes) - should fetch again
      mockTime += 2 * 60 * 1000;
      await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      Date.now = originalNow;
    });
  });

  describe('Error Handling', () => {
    it('should return "normal" when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getCurrentWeather(40.7128, -74.0060);

      expect(result).toBe('normal');
      expect(console.warn).toHaveBeenCalledWith('Failed to fetch weather data:', expect.any(Error));
    });

    it('should return "normal" when API returns non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await getCurrentWeather(40.7128, -74.0060);

      expect(result).toBe('normal');
      expect(console.warn).toHaveBeenCalledWith('Failed to fetch weather data:', expect.any(Error));
    });

    it('should return "normal" when JSON parsing fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      const result = await getCurrentWeather(40.7128, -74.0060);

      expect(result).toBe('normal');
      expect(console.warn).toHaveBeenCalledWith('Failed to fetch weather data:', expect.any(Error));
    });
  });

  describe('clearWeatherCache', () => {
    it('should clear the weather cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenMeteoResponse)
      });

      // First call
      await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache
      clearWeatherCache();

      // Second call should fetch again
      await getCurrentWeather(40.7128, -74.0060);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});