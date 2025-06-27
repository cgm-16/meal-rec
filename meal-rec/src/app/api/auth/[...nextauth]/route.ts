// ABOUTME: NextAuth API route handler using shared configuration
// ABOUTME: Exports GET and POST handlers for NextAuth authentication endpoints

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };