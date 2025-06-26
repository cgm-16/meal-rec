// ABOUTME: Test for the Home page component
// ABOUTME: Ensures the Home component renders with the correct "Hello MealRec" text

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renders Hello MealRec', () => {
    render(<Home />);
    expect(screen.getByText('Hello MealRec')).toBeInTheDocument();
  });
});