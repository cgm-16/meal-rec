// ABOUTME: Test for the Home page component
// ABOUTME: Ensures the Home component renders with the correct MealRec branding

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renders MealRec heading', () => {
    render(<Home />);
    expect(screen.getByText('MealRec')).toBeInTheDocument();
    expect(screen.getByText('Discover your next favorite meal')).toBeInTheDocument();
  });
});