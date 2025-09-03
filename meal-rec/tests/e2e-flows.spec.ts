// ABOUTME: Comprehensive E2E tests for guest, auth, and admin user flows
// ABOUTME: Tests complete user journeys from sign-up to meal recommendations

import { test, expect } from '@playwright/test';

test.describe('E2E User Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route('/api/meals/random', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _id: 'test-meal-id',
          name: 'Test Pasta',
          cuisine: 'Italian',
          primaryIngredients: ['pasta', 'tomato', 'basil'],
          flavorTags: ['savory', 'herby'],
          imageUrl: '/test-meal.jpg',
          description: 'A delicious test pasta dish',
          spiciness: 2,
          heaviness: 3
        })
      });
    });

    await page.route('/api/feedback', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.route('/api/recommend', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _id: 'recommended-meal-id',
          name: 'Recommended Dish',
          cuisine: 'Asian',
          primaryIngredients: ['rice', 'vegetables'],
          flavorTags: ['spicy', 'fresh'],
          imageUrl: '/recommended-meal.jpg',
          description: 'A personalized recommendation',
          spiciness: 3,
          heaviness: 2
        })
      });
    });

    await page.route('/api/analytics', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          topLikedMeals: [
            { name: 'Popular Pasta', count: 15 },
            { name: 'Tasty Burger', count: 12 }
          ],
          topDislikedMeals: [
            { name: 'Unpopular Soup', count: 8 }
          ],
          topFlavorTags: [
            { tag: 'savory', count: 25 },
            { tag: 'spicy', count: 18 }
          ]
        })
      });
    });
  });

  test('Guest User Flow - Browse and provide feedback', async ({ page }) => {
    // 1. Visit homepage
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('MealRec');

    // 2. Wait for random meal to load
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();
    await expect(page.locator('text=Test Pasta')).toBeVisible();

    // 3. Provide feedback (like)
    await page.click('[data-testid="like-button"]');
    
    // 4. Verify new meal loads after feedback
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();

    // 5. Test different feedback types
    await page.click('[data-testid="dislike-button"]');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();

    await page.click('[data-testid="interested-button"]');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();
  });

  test('Quiz Flow - Take quiz and get recommendations', async ({ page }) => {
    // 1. Navigate to quiz
    await page.goto('/quiz');
    await expect(page.locator('h1')).toContainText('Food Preferences');

    // 2. Fill out step 1 - ingredients to avoid
    await page.fill('input[name="ingredientsToAvoid"]', 'shellfish, peanuts');
    await page.click('button:has-text("Next")');

    // 3. Fill out step 2 - spiciness preference
    await page.fill('input[name="spiciness"]', '3');
    await page.click('button:has-text("Next")');

    // 4. Fill out step 3 - surprise factor
    await page.fill('input[name="surpriseFactor"]', '7');
    await page.click('button:has-text("Get Recommendations")');

    // 5. Should redirect to home with personalized recommendation
    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();
  });

  test('Authentication Flow - Sign up and sign in', async ({ page }) => {
    // Mock auth endpoints
    await page.route('/api/auth/signup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          message: 'User created successfully',
          user: { id: 'new-user-id', username: 'testuser' }
        })
      });
    });

    await page.route('/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'new-user-id',
            name: 'testuser',
            email: null
          },
          expires: '2024-12-31T23:59:59.999Z'
        })
      });
    });

    // 1. Navigate to sign up
    await page.goto('/auth/signup');
    await expect(page.locator('h2')).toContainText('Create your account');

    // 2. Fill out sign up form
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="pin"]', '1234');
    await page.click('button[type="submit"]');

    // 3. Should redirect to sign in after successful signup
    await expect(page).toHaveURL('/auth/signin');

    // 4. Sign in with the credentials
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="pin"]', '1234');
    await page.click('button[type="submit"]');

    // 5. Should redirect to home page when authenticated
    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();
  });

  test('Authentication Failure Scenarios', async ({ page }) => {
    // Mock failed auth responses
    await page.route('/api/auth/callback/credentials', async route => {
      const request = route.request();
      const postData = request.postData();
      
      // Parse form data to determine response
      if (postData?.includes('wronguser') || postData?.includes('9999')) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid credentials' })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: '/' })
        });
      }
    });

    // 1. Test invalid username
    await page.goto('/auth/signin');
    await page.fill('input[name="username"]', 'wronguser');
    await page.fill('input[name="pin"]', '1234');
    await page.click('button[type="submit"]');
    
    // Should show error and stay on signin page
    await expect(page.locator('text=Sign in failed')).toBeVisible();
    await expect(page).toHaveURL('/auth/signin');

    // 2. Test invalid PIN
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="pin"]', '9999');
    await page.click('button[type="submit"]');
    
    // Should show error and stay on signin page
    await expect(page.locator('text=Sign in failed')).toBeVisible();
    await expect(page).toHaveURL('/auth/signin');
  });

  test('Form Validation Scenarios', async ({ page }) => {
    // 1. Test signup form validation - short username
    await page.goto('/auth/signup');
    await page.fill('input[name="username"]', 'ab'); // 2 characters
    await page.fill('input[name="pin"]', '1234');
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=Username must be at least 3 characters')).toBeVisible();

    // 2. Test signup form validation - invalid PIN format
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="pin"]', '123'); // 3 digits
    await page.click('button[type="submit"]');
    
    // Should show PIN validation error
    await expect(page.locator('text=PIN must be exactly 4 digits')).toBeVisible();

    // 3. Test PIN input constraints
    const pinInput = page.locator('input[name="pin"]');
    await pinInput.fill('12345'); // Try to enter 5 digits
    await expect(pinInput).toHaveValue('1234'); // Should be truncated to 4

    // 4. Test that form doesn't submit with missing fields
    await page.fill('input[name="username"]', '');
    await page.fill('input[name="pin"]', '');
    
    // Button should be disabled or form should not submit
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('Explore Analytics Flow - View meal analytics', async ({ page }) => {
    // 1. Navigate to explore page
    await page.goto('/explore');
    await expect(page.locator('h1')).toContainText('Meal Analytics');

    // 2. Wait for analytics data to load
    await expect(page.locator('text=Popular Pasta')).toBeVisible();
    await expect(page.locator('text=Tasty Burger')).toBeVisible();

    // 3. Check that charts are rendered
    await expect(page.locator('.recharts-wrapper')).toBeVisible();

    // 4. Verify analytics summary
    await expect(page.locator('text=Most Loved Meals')).toBeVisible();
    await expect(page.locator('text=Most Disliked Meals')).toBeVisible();
    await expect(page.locator('text=Popular Flavor Tags')).toBeVisible();
  });

  test('Admin Flow - Access admin panel (unauthorized)', async ({ page }) => {
    // Mock unauthorized access
    await page.route('/api/admin/meals', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Admin access required' })
      });
    });

    await page.route('/api/admin/users', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Admin access required' })
      });
    });

    // 1. Try to access admin panel without authorization
    await page.goto('/admin');

    // 2. Should show access denied message
    await expect(page.locator('text=Admin access required')).toBeVisible();
    await expect(page.locator('button:has-text("Go Home")')).toBeVisible();

    // 3. Click go home button
    await page.click('button:has-text("Go Home")');
    await expect(page).toHaveURL('/');
  });

  test('Admin Flow - Authorized admin access', async ({ page }) => {
    // Mock authorized admin session
    await page.route('/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            name: 'admin',
            email: null
          },
          expires: '2024-12-31T23:59:59.999Z'
        })
      });
    });

    await page.route('/api/admin/meals', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          meals: [
            {
              _id: 'meal-1',
              name: 'Admin Test Meal',
              cuisine: 'Test Cuisine',
              primaryIngredients: ['test'],
              spiciness: 2,
              heaviness: 3
            }
          ],
          total: 1
        })
      });
    });

    await page.route('/api/admin/users', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              _id: 'user-1',
              username: 'testuser',
              banned: false,
              createdAt: '2024-01-01T00:00:00.000Z'
            }
          ],
          total: 1
        })
      });
    });

    // 1. Access admin panel as authorized admin
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Admin Panel');

    // 2. Check meals tab is active by default
    await expect(page.locator('text=Meal Management')).toBeVisible();
    await expect(page.locator('text=Admin Test Meal')).toBeVisible();

    // 3. Switch to users tab
    await page.click('[data-cy="users-tab"]');
    await expect(page.locator('text=User Management')).toBeVisible();
    await expect(page.locator('text=testuser')).toBeVisible();

    // 4. Test add new meal button
    await page.click('[data-cy="meals-tab"]');
    await expect(page.locator('button:has-text("Add New Meal")')).toBeVisible();
  });

  test('Offline Functionality - Service worker and offline page', async ({ page }) => {
    // 1. Visit homepage to register service worker
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('MealRec');

    // 2. Wait for service worker registration
    await page.waitForTimeout(2000);

    // 3. Navigate to offline page
    await page.goto('/offline');
    await expect(page.locator('h1')).toContainText("You're Offline");
    await expect(page.locator('text=🍽️')).toBeVisible();

    // 4. Test navigation back to main app
    await expect(page.locator('a:has-text("Browse previously loaded meals")')).toBeVisible();
  });

  test('Navigation and responsiveness', async ({ page }) => {
    // 1. Test main navigation
    await page.goto('/');
    
    // 2. Navigate to quiz via link/button if available
    await page.goto('/quiz');
    await expect(page.locator('h1')).toContainText('Food Preferences');

    // 3. Navigate to explore
    await page.goto('/explore');
    await expect(page.locator('h1')).toContainText('Meal Analytics');

    // 4. Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();

    // 5. Test tablet viewport  
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();

    // 6. Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();
  });
});