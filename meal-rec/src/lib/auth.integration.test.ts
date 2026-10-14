// ABOUTME: Database-backed tests for the credentials authorize flow
// ABOUTME: Covers banned users and lockout after repeated failed sign-in attempts

/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import type { CredentialsConfig } from 'next-auth/providers/credentials';
import { User } from '@meal-rec/database';
import { authOptions } from './auth';
import { APP_CONSTANTS } from './constants';

// CredentialsProvider keeps the user-supplied authorize on `options`; the top-level one is a stub
const authorize = (pin: string, username = 'lockuser') =>
  (authOptions.providers[0] as unknown as { options: CredentialsConfig }).options.authorize({ username, pin }, {} as never);

describe('authorize (database-backed)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URL = mongoServer.getUri();
    await mongoose.connect(process.env.MONGO_URL);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await new User({ username: 'lockuser', hashedPin: await bcrypt.hash('1234', 4) }).save();
  });

  it('signs in with the correct PIN', async () => {
    expect(await authorize('1234')).toMatchObject({ name: 'lockuser' });
  });

  it('signs in a user stored before lockout fields existed', async () => {
    await User.collection.insertOne({ username: 'legacyuser', hashedPin: await bcrypt.hash('1234', 4) });
    expect(await authorize('1234', 'legacyuser')).toMatchObject({ name: 'legacyuser' });
  });

  it('rejects a banned user even with the correct PIN', async () => {
    await User.updateOne({ username: 'lockuser' }, { banned: true });
    expect(await authorize('1234')).toBeNull();
  });

  it('locks the account after repeated failed attempts, even for the correct PIN', async () => {
    for (let attempt = 0; attempt < APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS; attempt++) {
      expect(await authorize('0000')).toBeNull();
    }
    expect(await authorize('1234')).toBeNull();
  });

  it('evaluates at most the allowed number of PINs from a concurrent burst', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    await Promise.all(
      Array.from({ length: APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS * 4 }, () => authorize('0000'))
    );
    expect(compare).toHaveBeenCalledTimes(APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS);
    expect(await authorize('1234')).toBeNull();
    compare.mockRestore();
  });

  it('unlocks once the lockout period has passed', async () => {
    for (let attempt = 0; attempt < APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS; attempt++) {
      await authorize('0000');
    }
    await User.updateOne({ username: 'lockuser' }, { lockedUntil: new Date(Date.now() - 1000) });
    expect(await authorize('1234')).toMatchObject({ name: 'lockuser' });
  });

  it('resets the failure count after a successful sign-in', async () => {
    for (let attempt = 0; attempt < APP_CONSTANTS.MAX_FAILED_SIGNIN_ATTEMPTS - 1; attempt++) {
      await authorize('0000');
    }
    expect(await authorize('1234')).toMatchObject({ name: 'lockuser' });
    expect(await authorize('0000')).toBeNull();
    expect(await authorize('1234')).toMatchObject({ name: 'lockuser' });
  });
});
