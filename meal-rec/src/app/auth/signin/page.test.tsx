// ABOUTME: Unit tests for sign-in page component with NextAuth integration
// ABOUTME: Tests form submission, authentication flow, and session management

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, getSession } from 'next-auth/react';
import SignInPage from './page';

// Mock Next.js router and navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush
  }),
  useSearchParams: () => ({
    get: vi.fn((key) => key === 'message' ? 'Account created successfully' : null)
  })
}));

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  getSession: vi.fn()
}));

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render sign-in form', () => {
    render(<SignInPage />);
    
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByText('Enter your username and PIN')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('4-digit PIN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Don\'t have an account? Sign up')).toBeInTheDocument();
  });

  it('should display success message from URL params', () => {
    render(<SignInPage />);
    
    expect(screen.getByText('Account created successfully')).toBeInTheDocument();
    expect(screen.getByText('Account created successfully').closest('div')).toHaveClass('bg-green-100');
  });

  it('should submit form with valid credentials and redirect on success', async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockResolvedValue({ error: null });
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'user123', name: 'testuser' } });

    render(<SignInPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('credentials', {
        username: 'testuser',
        pin: '1234',
        redirect: false
      });
    });

    await waitFor(() => {
      expect(getSession).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('should display error message for invalid credentials', async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockResolvedValue({ error: 'CredentialsSignin' });

    render(<SignInPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '9999');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid username or PIN')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should handle session creation failure', async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockResolvedValue({ error: null });
    vi.mocked(getSession).mockResolvedValue(null);

    render(<SignInPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to create session')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should handle network errors', async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockRejectedValue(new Error('Network error'));

    render(<SignInPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should disable form during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<SignInPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
      expect(usernameInput).toBeDisabled();
      expect(pinInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  it('should validate PIN input format', () => {
    render(<SignInPage />);
    
    const pinInput = screen.getByPlaceholderText('4-digit PIN') as HTMLInputElement;
    
    expect(pinInput.type).toBe('password');
    expect(pinInput.maxLength).toBe(4);
    expect(pinInput.pattern).toBe('\\d{4}');
  });

  it('should require both username and PIN', () => {
    render(<SignInPage />);
    
    const usernameInput = screen.getByPlaceholderText('Username') as HTMLInputElement;
    const pinInput = screen.getByPlaceholderText('4-digit PIN') as HTMLInputElement;
    
    expect(usernameInput.required).toBe(true);
    expect(pinInput.required).toBe(true);
  });
});