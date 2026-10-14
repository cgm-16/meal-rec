// ABOUTME: NextAuth configuration and authentication utilities
// ABOUTME: Provides session management and authentication helpers for the application

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { connect, User } from '@meal-rec/database';
import { APP_CONSTANTS } from './constants';

interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        pin: { label: 'PIN', type: 'password', maxLength: 4 }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.pin) {
          return null;
        }

        try {
          await connect();
          
          // Reserve an attempt atomically before comparing, so concurrent requests
          // cannot evaluate more than MAX_FAILED_SIGNIN_ATTEMPTS PINs between lockouts
          const user = await User.findOneAndUpdate(
            {
              username: credentials.username,
              banned: { $ne: true },
              failedSignInAttempts: { $not: { $gte: APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS } },
              $or: [{ lockedUntil: null }, { lockedUntil: { $lte: new Date() } }]
            },
            { $inc: { failedSignInAttempts: 1 } },
            { new: true }
          );
          if (!user) {
            return null;
          }

          const isValidPin = await bcrypt.compare(credentials.pin, user.hashedPin);
          if (!isValidPin) {
            if (user.failedSignInAttempts >= APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS) {
              await User.updateOne(
                { _id: user._id },
                {
                  failedSignInAttempts: 0,
                  lockedUntil: new Date(Date.now() + APP_CONSTANTS.SIGNIN_LOCKOUT_MINUTES * 60 * 1000)
                }
              );
            }
            return null;
          }

          await User.updateOne({ _id: user._id }, { failedSignInAttempts: 0, $unset: { lockedUntil: 1 } });

          return {
            id: (user._id as string).toString(),
            name: user.username,
            email: null,
            role: user.role || 'user' // Include role from database
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60 // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        const user = session.user as ExtendedUser;
        user.id = token.userId;
        user.role = token.role;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
};