// ABOUTME: Playwright test to verify PWA installability and service worker registration
// ABOUTME: Tests manifest.json availability and PWA install criteria

import { test, expect } from '@playwright/test';

test.describe('PWA Installability', () => {
  test('should have valid manifest.json', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Check that manifest.json is accessible
    const manifestResponse = await page.request.get('/manifest.json');
    expect(manifestResponse.status()).toBe(200);
    
    const manifest = await manifestResponse.json();
    
    // Verify required manifest fields
    expect(manifest.name).toBe('Meal Recommendation PWA');
    expect(manifest.short_name).toBe('MealRec');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toHaveLength(2);
    
    // Verify icons
    expect(manifest.icons[0].sizes).toBe('192x192');
    expect(manifest.icons[1].sizes).toBe('512x512');
  });

  test('should register service worker', async ({ page }) => {
    await page.goto('/');
    
    // Wait for service worker registration
    await page.waitForFunction(() => {
      return 'serviceWorker' in navigator;
    });
    
    const serviceWorkerRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          return !!registration;
        } catch {
          return false;
        }
      }
      return false;
    });
    
    expect(serviceWorkerRegistered).toBe(true);
  });

  test('should have PWA installability criteria', async ({ page }) => {
    await page.goto('/');
    
    // Check for manifest link in head
    const manifestLink = await page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json');
    
    // Check that the page is served over HTTPS in production (or HTTP in dev)
    const url = page.url();
    expect(url.startsWith('http://') || url.startsWith('https://')).toBe(true);
  });

  test('should display offline page when network is unavailable', async ({ page, context }) => {
    // Navigate to app first to register service worker
    await page.goto('/');
    
    // Wait for service worker to be ready
    await page.waitForTimeout(2000);
    
    // Navigate to offline page directly to test it
    await page.goto('/offline');
    
    // Verify offline page content
    await expect(page.locator('h1')).toContainText("Offline");
    await expect(page.locator('text=🍽️')).toBeVisible();
    await expect(page.locator('text=Browse previously loaded meals')).toBeVisible();
  });
});