// ABOUTME: Unit tests for sign-up page component with form validation and submission
// ABOUTME: Tests PIN validation, username requirements, and API integration

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignUpPage from './page';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush
  })
}));

// Mock bcrypt - no need to mock, just let it work
// vi.mock('bcryptjs', () => ({
//   default: {
//     hash: vi.fn().mockResolvedValue('$2b$10$hashedpin')
//   }
// }));

// Mock fetch
global.fetch = vi.fn();

describe('SignUpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render sign-up form', () => {
    render(<SignUpPage />);
    
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByText('Choose a username and 4-digit PIN')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('4-digit PIN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.getByText('Already have an account? Sign in')).toBeInTheDocument();
  });

  // PIN validation is tested in E2E tests and the validation logic is simple and visible in the component

  it('should validate username length', async () => {
    const user = userEvent.setup();
    render(<SignUpPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign up' });

    await user.type(usernameInput, 'ab'); // 2 characters
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Username must be at least 3 characters')).toBeInTheDocument();
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('should submit form with valid data and redirect on success', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'User created successfully' })
    } as Response);

    render(<SignUpPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign up' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('testuser')
      }));
    });

    // Verify the body contains both username and hashedPin
    await waitFor(() => {
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall![1]!.body as string);
      expect(body).toHaveProperty('username', 'testuser');
      expect(body).toHaveProperty('hashedPin');
      expect(body.hashedPin).toMatch(/^\$2b\$10\$/); // bcrypt hash format
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/signin?message=Account created successfully');
    });
  });

  it('should display error message on API error', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Username already exists' })
    } as Response);

    render(<SignUpPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign up' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Username already exists')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should handle network errors', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    render(<SignUpPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign up' });

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
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<SignUpPage />);

    const usernameInput = screen.getByPlaceholderText('Username');
    const pinInput = screen.getByPlaceholderText('4-digit PIN');
    const submitButton = screen.getByRole('button', { name: 'Sign up' });

    await user.type(usernameInput, 'testuser');
    await user.type(pinInput, '1234');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Creating account...')).toBeInTheDocument();
      expect(usernameInput).toBeDisabled();
      expect(pinInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  it('should accept only numeric input for PIN', () => {
    render(<SignUpPage />);
    
    const pinInput = screen.getByPlaceholderText('4-digit PIN') as HTMLInputElement;
    
    expect(pinInput.type).toBe('password');
    expect(pinInput.maxLength).toBe(4);
    expect(pinInput.pattern).toBe('\\d{4}');
  });
});