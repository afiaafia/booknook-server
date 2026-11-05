import { ObjectId } from 'mongodb';

import { getCollections } from '../../config/collections.js';

import type { Rating } from './rating.types.js';

const getRatingsCollection = () => getCollections().ratings;

export const ratingRepository = {
  async findByBookAndUser(
    bookId: string,
    userId: string
  ): Promise<Rating | null> {
    return getRatingsCollection().findOne({
      bookId: new ObjectId(bookId),
      userId,
    });
  },

  async upsert(
    bookId: string,
    userId: string,
    rating: number
  ): Promise<void> {
    const now = new Date();

    await getRatingsCollection().updateOne(
      {
        bookId: new ObjectId(bookId),
        userId,
      },
      {
        $set: {
          rating,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );
  },

  async findSummary(bookId: string) {
    return getRatingsCollection()
      .aggregate<{
        _id: number;
        count: number;
      }>([
        {
          $match: {
            bookId: new ObjectId(bookId),
          },
        },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
  },
};
