// ABOUTME: Client-side SessionProvider wrapper to handle NextAuth session context
// ABOUTME: Separates client-side session logic from server-side layout components

'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

interface ClientSessionProviderProps {
  children: ReactNode;
}

export default function ClientSessionProvider({ children }: ClientSessionProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}