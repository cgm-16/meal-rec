import type { TestProject } from 'vitest/node';
import { MongoMemoryServer } from 'mongodb-memory-server';

declare module 'vitest' {
  export interface ProvidedContext {
    MONGO_URI: string;
  }
}

export default async function setup({ provide }: TestProject) {
  const mongod = await MongoMemoryServer.create();

  const uri = mongod.getUri();

  provide('MONGO_URI', uri);

  return async () => {
    await mongod.stop();
  };
}