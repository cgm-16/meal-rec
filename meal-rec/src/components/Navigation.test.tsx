// ABOUTME: Tests for the Navigation component
// ABOUTME: Verifies navigation links, active states, and responsive behavior

import { render, screen, fireEvent } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { vi } from 'vitest';
import { SessionProvider } from 'next-auth/react';
import Navigation from './Navigation';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

const mockUsePathname = vi.mocked(usePathname);

// Helper to render Navigation with SessionProvider
const renderNavigation = (session = null) => {
  return render(
    <SessionProvider session={session}>
      <Navigation />
    </SessionProvider>
  );
};

describe('Navigation', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
  });

  it('renders all navigation items', () => {
    renderNavigation();
    
    expect(screen.getByText('MealRec')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Quiz')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('shows active state for current page', () => {
    mockUsePathname.mockReturnValue('/explore');
    renderNavigation();
    
    const exploreLink = screen.getByText('Explore');
    expect(exploreLink).toHaveClass('bg-blue-100', 'text-blue-700');
  });

  it('toggles mobile menu when hamburger is clicked', () => {
    renderNavigation();
    
    const hamburgerButton = screen.getByLabelText('Toggle navigation menu');
    
    // Mobile menu should be hidden initially
    expect(screen.queryByText('Meal recommendations')).not.toBeInTheDocument();
    
    // Click to open mobile menu
    fireEvent.click(hamburgerButton);
    expect(screen.getByText('Meal recommendations')).toBeInTheDocument();
    
    // Click to close mobile menu
    fireEvent.click(hamburgerButton);
    expect(screen.queryByText('Meal recommendations')).not.toBeInTheDocument();
  });

  it('closes mobile menu when a link is clicked', () => {
    renderNavigation();
    
    const hamburgerButton = screen.getByLabelText('Toggle navigation menu');
    fireEvent.click(hamburgerButton);
    
    // Menu should be open
    expect(screen.getByText('Meal recommendations')).toBeInTheDocument();
    
    // Click a nav link
    const homeLink = screen.getAllByText('Home')[1]; // Get the mobile menu version
    fireEvent.click(homeLink);
    
    // Menu should be closed
    expect(screen.queryByText('Meal recommendations')).not.toBeInTheDocument();
  });

  it('highlights correct active link for home page', () => {
    mockUsePathname.mockReturnValue('/');
    renderNavigation();
    
    const homeLink = screen.getAllByText('Home')[0]; // Desktop version
    expect(homeLink).toHaveClass('bg-blue-100', 'text-blue-700');
  });

  it('highlights correct active link for auth pages', () => {
    mockUsePathname.mockReturnValue('/auth/signin');
    renderNavigation();
    
    const signInLink = screen.getAllByText('Sign In')[0]; // Desktop version
    expect(signInLink).toHaveClass('bg-blue-100', 'text-blue-700');
  });
});