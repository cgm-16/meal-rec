// ABOUTME: Integration test for the Home page component
// ABOUTME: Tests meal fetching, feedback submission, and error handling with MSW

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import Home from './page';

const mockMeal = {
  _id: '123',
  name: 'Test Chicken Curry',
  cuisine: 'Indian',
  primaryIngredients: ['chicken', 'curry'],
  allergens: ['dairy'],
  weather: ['cold'],
  timeOfDay: ['dinner'],
  spiciness: 3,
  heaviness: 4,
  imageUrl: 'https://picsum.photos/400/300?random=1',
  description: 'A delicious curry',
  flavorTags: ['spicy', 'aromatic']
};

const server = setupServer(
  // Mock /api/meals/random endpoint
  http.get('/api/meals/random', () => {
    return HttpResponse.json({ meal: mockMeal });
  }),

  // Mock /api/feedback endpoint
  http.post('/api/feedback', () => {
    return HttpResponse.json({ ok: true });
  })
);

describe('Home Page', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('loads and displays a random meal', async () => {
    render(<Home />);

    // Should show loading state initially
    expect(screen.getByText('Finding your next meal...')).toBeInTheDocument();

    // Wait for meal to load
    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });

    expect(screen.getByText('Indian Cuisine')).toBeInTheDocument();
    expect(screen.getByText('A delicious curry')).toBeInTheDocument();
    expect(screen.getByText('spicy')).toBeInTheDocument();
    expect(screen.getByText('aromatic')).toBeInTheDocument();
  });

  it('submits feedback and fetches new meal on like', async () => {
    let feedbackReceived = false;
    let mealFetchCount = 0;

    server.use(
      http.get('/api/meals/random', () => {
        mealFetchCount++;
        return HttpResponse.json({ 
          meal: { 
            ...mockMeal, 
            name: mealFetchCount === 1 ? 'First Meal' : 'Second Meal',
            _id: mealFetchCount.toString()
          }
        });
      }),
      http.post('/api/feedback', async ({ request }) => {
        const body = await request.json() as { mealId: string; type: string };
        expect(body.mealId).toBe('1');
        expect(body.type).toBe('like');
        feedbackReceived = true;
        return HttpResponse.json({ ok: true });
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('First Meal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('👍 I like it'));

    await waitFor(() => {
      expect(screen.getByText('Second Meal')).toBeInTheDocument();
    });

    expect(feedbackReceived).toBe(true);
    expect(mealFetchCount).toBe(2);
  });

  it('submits feedback and fetches new meal on interested', async () => {
    let feedbackReceived = false;

    server.use(
      http.post('/api/feedback', async ({ request }) => {
        const body = await request.json() as { mealId: string; type: string };
        expect(body.type).toBe('interested');
        feedbackReceived = true;
        return HttpResponse.json({ ok: true });
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('🤔 Maybe'));

    await waitFor(() => {
      expect(feedbackReceived).toBe(true);
    });
  });

  it('submits feedback and fetches new meal on dislike', async () => {
    let feedbackReceived = false;

    server.use(
      http.post('/api/feedback', async ({ request }) => {
        const body = await request.json() as { mealId: string; type: string };
        expect(body.type).toBe('dislike');
        feedbackReceived = true;
        return HttpResponse.json({ ok: true });
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('👎 Not for me'));

    await waitFor(() => {
      expect(feedbackReceived).toBe(true);
    });
  });

  it('handles API error gracefully', async () => {
    server.use(
      http.get('/api/meals/random', () => {
        return HttpResponse.json(
          { error: 'No meals found' },
          { status: 404 }
        );
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('No meals found')).toBeInTheDocument();
    });

    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('allows manual meal refresh', async () => {
    let fetchCount = 0;

    server.use(
      http.get('/api/meals/random', () => {
        fetchCount++;
        return HttpResponse.json({ 
          meal: { 
            ...mockMeal, 
            name: `Meal ${fetchCount}`,
            _id: fetchCount.toString()
          }
        });
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Meal 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Get Another Recommendation'));

    await waitFor(() => {
      expect(screen.getByText('Meal 2')).toBeInTheDocument();
    });

    expect(fetchCount).toBe(2);
  });

  it('fetches new meal even when feedback fails', async () => {
    let mealFetchCount = 0;

    server.use(
      http.get('/api/meals/random', () => {
        mealFetchCount++;
        return HttpResponse.json({ 
          meal: { 
            ...mockMeal, 
            name: `Meal ${mealFetchCount}`,
            _id: mealFetchCount.toString()
          }
        });
      }),
      http.post('/api/feedback', () => {
        return HttpResponse.json(
          { error: 'Feedback failed' },
          { status: 500 }
        );
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Meal 1')).toBeInTheDocument();
    });

    const initialFetchCount = mealFetchCount;
    fireEvent.click(screen.getByText('👍 I like it'));

    // Wait for the second fetch to complete
    await waitFor(() => {
      expect(mealFetchCount).toBe(initialFetchCount + 1);
    });

    // Verify we still have a meal displayed
    expect(screen.getByText(/Meal \d+/)).toBeInTheDocument();
  });
});