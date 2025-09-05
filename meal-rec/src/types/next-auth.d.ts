// ABOUTME: NextAuth type extensions for custom user properties
// ABOUTME: Adds role property to User and Session types

import 'next-auth';

declare module 'next-auth' {
  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    role?: string;
  }
}