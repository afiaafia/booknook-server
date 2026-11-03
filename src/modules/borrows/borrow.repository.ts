import { ObjectId, type ClientSession } from 'mongodb';

import { getCollections } from '../../config/collections.js';

import type { Borrow } from './borrow.types.js';

const getBorrowsCollection = () => getCollections().borrows;

export const borrowRepository = {
  async findById(id: string, session?: ClientSession): Promise<Borrow | null> {
    return getBorrowsCollection().findOne(
      {
        _id: new ObjectId(id),
      },
      { session }
    );
  },

  async findActiveByUserAndBook(
    userId: string,
    bookId: string,
    session?: ClientSession
  ): Promise<Borrow | null> {
    return getBorrowsCollection().findOne(
      {
        userId,
        bookId: new ObjectId(bookId),
        status: 'active',
      },
      { session }
    );
  },

  async findByUser(userId: string): Promise<Borrow[]> {
    return getBorrowsCollection()
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
  },

  async create(
    input: Omit<Borrow, '_id' | 'createdAt' | 'updatedAt'>,
    session?: ClientSession
  ) {
    const now = new Date();

    const result = await getBorrowsCollection().insertOne(
      {
        ...input,
        createdAt: now,
        updatedAt: now,
      },
      { session }
    );

    return result.insertedId;
  },

  async markReturned(id: string, userId: string, session?: ClientSession) {
    return getBorrowsCollection().findOneAndUpdate(
      {
        _id: new ObjectId(id),
        userId,
        status: 'active',
      },
      {
        $set: {
          status: 'returned',
          returnedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
        session,
      }
    );
  },

  async markActive(id: string, userId: string) {
    return getBorrowsCollection().findOneAndUpdate(
      {
        _id: new ObjectId(id),
        userId,
        status: 'returned',
      },
      {
        $set: {
          status: 'active',
          returnedAt: null,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
  },
};
