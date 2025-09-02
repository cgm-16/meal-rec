// ABOUTME: Tests for the ClientSessionProvider component
// ABOUTME: Verifies NextAuth SessionProvider wrapper works correctly

import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ClientSessionProvider from './ClientSessionProvider';

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}));

describe('ClientSessionProvider', () => {
  it('renders children within SessionProvider', () => {
    render(
      <ClientSessionProvider>
        <div data-testid="child-component">Test Child</div>
      </ClientSessionProvider>
    );

    expect(screen.getByTestId('session-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child-component')).toBeInTheDocument();
    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('wraps multiple children correctly', () => {
    render(
      <ClientSessionProvider>
        <div data-testid="child-1">First Child</div>
        <div data-testid="child-2">Second Child</div>
      </ClientSessionProvider>
    );

    expect(screen.getByTestId('session-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });
});