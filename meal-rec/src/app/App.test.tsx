// ABOUTME: Test for the Home page component
// ABOUTME: Ensures the Home component renders with the correct MealRec branding

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Home from './page';

describe('Home', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders MealRec heading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      _id: '1', name: 'Stub Meal', primaryIngredients: [], allergens: [], weather: [],
      timeOfDay: [], spiciness: 0, heaviness: 0, flavorTags: []
    }))));

    render(<Home />);
    expect(screen.getByText('MealRec')).toBeInTheDocument();
    expect(screen.getByText('Discover your next favorite meal')).toBeInTheDocument();

    // Let the initial recommendation fetch settle so its state updates happen inside the test
    await waitFor(() => {
      expect(screen.getByText('Stub Meal')).toBeInTheDocument();
    });
  });
});
