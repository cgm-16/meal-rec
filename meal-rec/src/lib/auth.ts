// ABOUTME: NextAuth configuration and authentication utilities
// ABOUTME: Provides session management and authentication helpers for the application

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { connect, User } from '@meal-rec/database';

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
          
          const user = await User.findOne({ username: credentials.username });
          if (!user) {
            return null;
          }

          const isValidPin = await bcrypt.compare(credentials.pin, user.hashedPin);
          if (!isValidPin) {
            return null;
          }

          return {
            id: (user._id as string).toString(),
            name: user.username,
            email: null
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
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
};