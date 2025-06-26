// ABOUTME: Test for Quiz page component
// ABOUTME: Tests multi-step form functionality, localStorage persistence, and navigation

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import Quiz from './page';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn()
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('Quiz Page', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: mockPush
    });
  });

  it('renders the first step of the quiz', () => {
    render(<Quiz />);
    
    expect(screen.getByText('Food Preferences Quiz')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('What ingredients would you like to avoid?')).toBeInTheDocument();
  });

  it('allows selecting and deselecting ingredients to avoid', () => {
    render(<Quiz />);
    
    const nutsButton = screen.getByTestId('ingredient-nuts');
    const dairyButton = screen.getByTestId('ingredient-dairy');
    
    // Initially not selected
    expect(nutsButton).not.toHaveClass('border-red-500');
    expect(dairyButton).not.toHaveClass('border-red-500');
    
    // Select nuts
    fireEvent.click(nutsButton);
    expect(nutsButton).toHaveClass('border-red-500');
    
    // Select dairy
    fireEvent.click(dairyButton);
    expect(dairyButton).toHaveClass('border-red-500');
    
    // Deselect nuts
    fireEvent.click(nutsButton);
    expect(nutsButton).not.toHaveClass('border-red-500');
    expect(dairyButton).toHaveClass('border-red-500'); // dairy still selected
  });

  it('navigates through all quiz steps', () => {
    render(<Quiz />);
    
    // Step 1: Select some ingredients and go to next step
    fireEvent.click(screen.getByTestId('ingredient-nuts'));
    fireEvent.click(screen.getByTestId('next-step-1'));
    
    // Step 2: Should show spiciness question
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('How spicy do you like your food?')).toBeInTheDocument();
    expect(screen.getByTestId('spiciness-slider')).toBeInTheDocument();
    
    // Test back button
    fireEvent.click(screen.getByTestId('back-step-2'));
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    
    // Go back to step 2
    fireEvent.click(screen.getByTestId('next-step-1'));
    fireEvent.click(screen.getByTestId('next-step-2'));
    
    // Step 3: Should show surprise factor question
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('How adventurous are you feeling?')).toBeInTheDocument();
    expect(screen.getByTestId('surprise-slider')).toBeInTheDocument();
  });

  it('updates spiciness value when slider changes', () => {
    render(<Quiz />);
    
    // Navigate to step 2
    fireEvent.click(screen.getByTestId('next-step-1'));
    
    const slider = screen.getByTestId('spiciness-slider') as HTMLInputElement;
    const valueDisplay = screen.getByTestId('spiciness-value');
    
    // Initial value should be 0
    expect(valueDisplay).toHaveTextContent('0');
    expect(slider.value).toBe('0');
    
    // Change slider to 3
    fireEvent.change(slider, { target: { value: '3' } });
    expect(valueDisplay).toHaveTextContent('3');
  });

  it('updates surprise factor value when slider changes', () => {
    render(<Quiz />);
    
    // Navigate to step 3
    fireEvent.click(screen.getByTestId('next-step-1'));
    fireEvent.click(screen.getByTestId('next-step-2'));
    
    const slider = screen.getByTestId('surprise-slider') as HTMLInputElement;
    const valueDisplay = screen.getByTestId('surprise-value');
    
    // Initial value should be 5
    expect(valueDisplay).toHaveTextContent('5');
    expect(slider.value).toBe('5');
    
    // Change slider to 8
    fireEvent.change(slider, { target: { value: '8' } });
    expect(valueDisplay).toHaveTextContent('8');
  });

  it('saves answers to localStorage and redirects on completion', async () => {
    render(<Quiz />);
    
    // Fill out the complete quiz
    // Step 1: Select ingredients
    fireEvent.click(screen.getByTestId('ingredient-nuts'));
    fireEvent.click(screen.getByTestId('ingredient-dairy'));
    fireEvent.click(screen.getByTestId('next-step-1'));
    
    // Step 2: Set spiciness
    const spicinessSlider = screen.getByTestId('spiciness-slider');
    fireEvent.change(spicinessSlider, { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('next-step-2'));
    
    // Step 3: Set surprise factor and submit
    const surpriseSlider = screen.getByTestId('surprise-slider');
    fireEvent.change(surpriseSlider, { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('submit-quiz'));
    
    // Check localStorage was called with correct data
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'quizAnswers',
        JSON.stringify({
          ingredientsToAvoid: ['nuts', 'dairy'],
          spiciness: 3,
          surpriseFactor: 7
        })
      );
    });
    
    // Check router push was called
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('handles empty ingredient selection', () => {
    render(<Quiz />);
    
    // Don't select any ingredients, just proceed
    fireEvent.click(screen.getByTestId('next-step-1'));
    fireEvent.click(screen.getByTestId('next-step-2'));
    fireEvent.click(screen.getByTestId('submit-quiz'));
    
    // Should still save with empty array
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'quizAnswers',
      JSON.stringify({
        ingredientsToAvoid: [],
        spiciness: 0,
        surpriseFactor: 5
      })
    );
  });

  it('shows progress bar correctly for each step', () => {
    render(<Quiz />);
    
    // Step 1: 33.33% progress
    let progressBar = document.querySelector('.bg-blue-600') as HTMLElement;
    expect(progressBar.style.width).toContain('33.33');
    
    // Step 2: 66.67% progress
    fireEvent.click(screen.getByTestId('next-step-1'));
    progressBar = document.querySelector('.bg-blue-600') as HTMLElement;
    expect(progressBar.style.width).toContain('66.66');
    
    // Step 3: 100% progress
    fireEvent.click(screen.getByTestId('next-step-2'));
    progressBar = document.querySelector('.bg-blue-600') as HTMLElement;
    expect(progressBar.style.width).toBe('100%');
  });
});