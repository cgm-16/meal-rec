// ABOUTME: Sign-up page that collects username and 4-digit PIN, hashes PIN with bcrypt
// ABOUTME: Creates new user account and redirects to sign-in page on success

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import bcrypt from 'bcryptjs';

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    username: '',
    pin: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate PIN is 4 digits
    if (!/^\d{4}$/.test(formData.pin)) {
      setError('PIN must be exactly 4 digits');
      setIsLoading(false);
      return;
    }

    // Validate username
    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      setIsLoading(false);
      return;
    }

    try {
      // Hash PIN on client side before sending
      const hashedPin = await bcrypt.hash(formData.pin, 10);

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          hashedPin
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/auth/signin?message=Account created successfully');
      } else {
        setError(data.error || 'Failed to create account');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Sign-up error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Choose a username and 4-digit PIN
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="pin" className="sr-only">
                PIN
              </label>
              <input
                id="pin"
                name="pin"
                type="password"
                required
                maxLength={4}
                pattern="\d{4}"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="4-digit PIN"
                value={formData.pin}
                onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? 'Creating account...' : 'Sign up'}
            </button>
          </div>

          <div className="text-center">
            <a
              href="/auth/signin"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Already have an account? Sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}