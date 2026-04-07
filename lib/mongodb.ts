import { MongoClient, Db } from "mongodb";

const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "misstep";

interface MongoCache {
  client: MongoClient;
  db: Db;
  promise: Promise<MongoClient> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoCache: MongoCache | undefined;
}

const cached: MongoCache = globalThis._mongoCache ?? {
  client: null as unknown as MongoClient,
  db: null as unknown as Db,
  promise: null,
};

if (!globalThis._mongoCache) {
  globalThis._mongoCache = cached;
}

export async function getDb(): Promise<Db> {
  if (cached.db) return cached.db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please define the MONGODB_URI environment variable");
  }

  if (!cached.promise) {
    cached.promise = MongoClient.connect(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
    });
  }

  try {
    cached.client = await cached.promise;
  } catch (err) {
    // Clear so the next call retries instead of awaiting a rejected promise forever
    cached.promise = null;
    throw err;
  }

  cached.db = cached.client.db(MONGODB_DB_NAME);
  return cached.db;
}

export async function getClient(): Promise<MongoClient> {
  if (cached.client) return cached.client;
  await getDb();
  return cached.client;
}
