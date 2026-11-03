import { MongoClient, type Db } from 'mongodb';

import { env } from './env.js';
import { logger } from './logger.js';

let client: MongoClient | null = null;
let database: Db | null = null;
let connectionPromise: Promise<Db> | null = null;

export const connectDatabase = async (): Promise<Db> => {
  if (database) {
    return database;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const mongoClient = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    try {
      await mongoClient.connect();

      const db = mongoClient.db(env.DB_NAME);

      // Verify actual database connectivity
      await db.command({ ping: 1 });

      client = mongoClient;
      database = db;

      logger.info(
        {
          database: env.DB_NAME,
        },
        'MongoDB connected successfully'
      );

      return db;
    } catch (error) {
      await mongoClient.close().catch(() => undefined);

      logger.error(
        {
          err: error,
        },
        'MongoDB connection failed'
      );

      throw error;
    }
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

export const getDatabase = (): Db => {
  if (!database) {
    throw new Error('Database is not connected. Call connectDatabase() first.');
  }

  return database;
};

export const getMongoClient = (): MongoClient => {
  if (!client) {
    throw new Error('Database is not connected. Call connectDatabase() first.');
  }

  return client;
};

export const closeDatabase = async (): Promise<void> => {
  if (!client) {
    return;
  }

  await client.close();

  client = null;
  database = null;

  logger.info('MongoDB connection closed');
};
