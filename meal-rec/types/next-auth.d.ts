// ABOUTME: Type definitions extending NextAuth default types
// ABOUTME: Adds custom user and session properties for our authentication system

import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}