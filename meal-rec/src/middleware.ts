// ABOUTME: Middleware to protect admin routes using NextAuth sessions
// ABOUTME: Redirects unauthenticated users to signin and checks admin role

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect admin routes
  if (pathname.startsWith('/admin')) {
    try {
      // Get the session token
      const token = await getToken({ 
        req: request, 
        secret: process.env.NEXTAUTH_SECRET 
      });

      // If no token, redirect to signin
      if (!token) {
        const signinUrl = new URL('/auth/signin', request.url);
        signinUrl.searchParams.set('callbackUrl', request.url);
        return NextResponse.redirect(signinUrl);
      }

      // Check if user has admin role (we'll store this in the token)
      if (!token.isAdmin) {
        // Redirect to home page with error
        const homeUrl = new URL('/', request.url);
        homeUrl.searchParams.set('error', 'admin-required');
        return NextResponse.redirect(homeUrl);
      }

      // User is authenticated and is admin, allow access
      return NextResponse.next();
    } catch (error) {
      console.error('Error checking admin authentication:', error);
      const signinUrl = new URL('/auth/signin', request.url);
      return NextResponse.redirect(signinUrl);
    }
  }

  // For all other routes, continue normally
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
  ],
};