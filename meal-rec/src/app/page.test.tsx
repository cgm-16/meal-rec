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
  // Mock /api/recommend endpoint
  http.post('/api/recommend', () => {
    return HttpResponse.json(mockMeal);
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

  it('sends stored quiz answers with the recommendation request', async () => {
    const quizAnswers = { ingredientsToAvoid: ['gluten'], spiciness: 3, surpriseFactor: 7 };
    localStorage.setItem('quizAnswers', JSON.stringify(quizAnswers));
    let receivedBody: unknown;

    server.use(
      http.post('/api/recommend', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(mockMeal);
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });
    expect(receivedBody).toEqual({ quiz: quizAnswers });

    localStorage.removeItem('quizAnswers');
  });

  it('requests a recommendation without quiz answers when none are stored', async () => {
    let receivedBody: unknown;

    server.use(
      http.post('/api/recommend', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(mockMeal);
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });
    expect(receivedBody).toEqual({});
  });

  it('submits feedback and fetches new meal on like', async () => {
    let feedbackReceived = false;
    let mealFetchCount = 0;

    server.use(
      http.post('/api/recommend', () => {
        mealFetchCount++;
        return HttpResponse.json({ 
          ...mockMeal, 
          name: mealFetchCount === 1 ? 'First Meal' : 'Second Meal',
          _id: mealFetchCount.toString()
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
      http.post('/api/recommend', () => {
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
      http.post('/api/recommend', () => {
        fetchCount++;
        return HttpResponse.json({ 
          ...mockMeal, 
          name: `Meal ${fetchCount}`,
          _id: fetchCount.toString()
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

  it('tells guests their feedback needs an account when the API returns 401', async () => {
    server.use(
      http.post('/api/feedback', () => {
        return HttpResponse.json({ error: 'Sign in to save feedback' }, { status: 401 });
      })
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('👍 I like it'));

    await waitFor(() => {
      expect(screen.getByText('Sign in to save your feedback and personalise recommendations.')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin');
  });

  it('shows the last recommendation with an offline notice when the network fails', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    });

    server.use(http.post('/api/recommend', () => HttpResponse.error()));
    fireEvent.click(screen.getByText('Get Another Recommendation'));

    await waitFor(() => {
      expect(screen.getByText("You're offline. Showing your last recommendation.")).toBeInTheDocument();
    });
    expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    localStorage.removeItem('lastRecommendation');
  });

  it('shows the error state on a network failure when nothing was recommended before', async () => {
    localStorage.removeItem('lastRecommendation');
    server.use(http.post('/api/recommend', () => HttpResponse.error()));

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('fetches new meal even when feedback fails', async () => {
    let mealFetchCount = 0;

    server.use(
      http.post('/api/recommend', () => {
        mealFetchCount++;
        return HttpResponse.json({ 
          ...mockMeal, 
          name: `Meal ${mealFetchCount}`,
          _id: mealFetchCount.toString()
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