// ABOUTME: Extended session types for user authentication
// ABOUTME: Provides type-safe access to custom user properties

export interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  isAdmin?: boolean;
}

export interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}