// ABOUTME: Test for MealCard component
// ABOUTME: Tests rendering, callback interactions, image fallback, and responsive layout

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MealCard, type Meal } from './MealCard';

const mockMeal: Meal = {
  _id: '123',
  name: 'Test Chicken Curry',
  cuisine: 'Indian',
  primaryIngredients: ['chicken', 'curry', 'rice'],
  allergens: ['dairy'],
  weather: ['cold'],
  timeOfDay: ['dinner'],
  spiciness: 3,
  heaviness: 4,
  imageUrl: 'https://picsum.photos/400/300?random=2',
  description: 'A delicious and spicy chicken curry with aromatic spices',
  flavorTags: ['spicy', 'aromatic', 'comfort']
};

describe('MealCard', () => {
  it('renders meal information correctly', () => {
    render(<MealCard meal={mockMeal} />);

    expect(screen.getByText('Test Chicken Curry')).toBeInTheDocument();
    expect(screen.getByText('Indian Cuisine')).toBeInTheDocument();
    expect(screen.getByText('A delicious and spicy chicken curry with aromatic spices')).toBeInTheDocument();
    
    // Check flavor tags
    expect(screen.getByText('spicy')).toBeInTheDocument();
    expect(screen.getByText('aromatic')).toBeInTheDocument();
    expect(screen.getByText('comfort')).toBeInTheDocument();
    
    // Check action buttons
    expect(screen.getByText('👎 Not for me')).toBeInTheDocument();
    expect(screen.getByText('🤔 Maybe')).toBeInTheDocument();
    expect(screen.getByText('👍 I like it')).toBeInTheDocument();
  });

  it('renders without optional fields', () => {
    const minimalMeal: Meal = {
      _id: '456',
      name: 'Simple Meal',
      primaryIngredients: ['ingredient'],
      allergens: [],
      weather: [],
      timeOfDay: [],
      spiciness: 0,
      heaviness: 0,
      flavorTags: []
    };

    render(<MealCard meal={minimalMeal} />);

    expect(screen.getByText('Simple Meal')).toBeInTheDocument();
    expect(screen.queryByText(/Cuisine/)).not.toBeInTheDocument();
    expect(screen.queryByText(/delicious/)).not.toBeInTheDocument();
    
    // Should still have action buttons
    expect(screen.getByText('👎 Not for me')).toBeInTheDocument();
    expect(screen.getByText('🤔 Maybe')).toBeInTheDocument();
    expect(screen.getByText('👍 I like it')).toBeInTheDocument();
  });

  it('displays fallback image when no imageUrl provided', () => {
    const mealWithoutImage: Meal = {
      ...mockMeal,
      imageUrl: undefined
    };

    render(<MealCard meal={mealWithoutImage} />);
    
    expect(screen.getByText('🍽️')).toBeInTheDocument();
  });

  it('calls onLike when like button is clicked', () => {
    const onLike = vi.fn();
    render(<MealCard meal={mockMeal} onLike={onLike} />);

    fireEvent.click(screen.getByText('👍 I like it'));
    
    expect(onLike).toHaveBeenCalledWith('123');
    expect(onLike).toHaveBeenCalledTimes(1);
  });

  it('calls onInterested when maybe button is clicked', () => {
    const onInterested = vi.fn();
    render(<MealCard meal={mockMeal} onInterested={onInterested} />);

    fireEvent.click(screen.getByText('🤔 Maybe'));
    
    expect(onInterested).toHaveBeenCalledWith('123');
    expect(onInterested).toHaveBeenCalledTimes(1);
  });

  it('calls onDislike when dislike button is clicked', () => {
    const onDislike = vi.fn();
    render(<MealCard meal={mockMeal} onDislike={onDislike} />);

    fireEvent.click(screen.getByText('👎 Not for me'));
    
    expect(onDislike).toHaveBeenCalledWith('123');
    expect(onDislike).toHaveBeenCalledTimes(1);
  });

  it('handles multiple callback clicks', () => {
    const onLike = vi.fn();
    const onInterested = vi.fn();
    const onDislike = vi.fn();
    
    render(
      <MealCard 
        meal={mockMeal} 
        onLike={onLike}
        onInterested={onInterested}
        onDislike={onDislike}
      />
    );

    fireEvent.click(screen.getByText('👍 I like it'));
    fireEvent.click(screen.getByText('🤔 Maybe'));
    fireEvent.click(screen.getByText('👎 Not for me'));
    
    expect(onLike).toHaveBeenCalledWith('123');
    expect(onInterested).toHaveBeenCalledWith('123');
    expect(onDislike).toHaveBeenCalledWith('123');
  });

  it('works without callback props', () => {
    // Should not throw when callbacks are not provided
    render(<MealCard meal={mockMeal} />);

    expect(() => {
      fireEvent.click(screen.getByText('👍 I like it'));
      fireEvent.click(screen.getByText('🤔 Maybe'));
      fireEvent.click(screen.getByText('👎 Not for me'));
    }).not.toThrow();
  });

  it('has proper CSS classes for responsive design', () => {
    const { container } = render(<MealCard meal={mockMeal} />);
    
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('max-w-[420px]');
    expect(cardElement).toHaveClass('w-full');
  });
});