import { ObjectId, type ClientSession, type Sort } from 'mongodb';

import { getCollections } from '../../config/collections.js';

import type { Book, CreateBookInput, UpdateBookInput } from './book.types.js';

import type { ListBooksQuery } from './book.validation.js';

const getBooksCollection = () => getCollections().books;

export const bookRepository = {
  async findAll(query: ListBooksQuery) {
    const collection = getBooksCollection();

    const { page, limit, search, category, sort } = query;

    const filter: Record<string, unknown> = {};

    if (category) filter.category = category;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } },
      ];
    }

    const sortOptions: Record<ListBooksQuery['sort'], 1 | -1> = {
      newest: -1,
      oldest: 1,
      'title-asc': 1,
      'title-desc': -1,
    };

    const sortField = sort.startsWith('title') ? 'title' : 'createdAt';

    const sortCriteria: Sort = {
      [sortField]: sortOptions[sort],
      _id: -1,
    };

    const [books, total] = await Promise.all([
      collection
        .find(filter)
        .sort(sortCriteria)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return {
      books,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  },

  async findLatest(limit = 6): Promise<Book[]> {
    return getBooksCollection()
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  },

  async findById(id: string, session?: ClientSession): Promise<Book | null> {
    return getBooksCollection().findOne(
      {
        _id: new ObjectId(id),
      },
      { session }
    );
  },

  async findByOwner(userId: string): Promise<Book[]> {
    return getBooksCollection()
      .find({ 'addedBy.userId': userId })
      .sort({ createdAt: -1 })
      .toArray();
  },

  async create(input: CreateBookInput): Promise<ObjectId> {
    const now = new Date();

    const book: Omit<Book, '_id'> = {
      ...input,
      availableCopies: input.totalCopies,
      createdAt: now,
      updatedAt: now,
    };

    const result = await getBooksCollection().insertOne(book);

    return result.insertedId;
  },

  async update(id: string, userId: string, input: UpdateBookInput) {
    const updateData: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };

    if (input.totalCopies !== undefined) {
      const borrowedCopies = {
        $subtract: ['$totalCopies', '$availableCopies'],
      };
      updateData.availableCopies = {
        $subtract: [input.totalCopies, borrowedCopies],
      };

      return getBooksCollection().findOneAndUpdate(
        {
          _id: new ObjectId(id),
          'addedBy.userId': userId,
          $expr: {
            $gte: [input.totalCopies, borrowedCopies],
          },
        },
        [{ $set: updateData }],
        { returnDocument: 'after' }
      );
    }

    return getBooksCollection().findOneAndUpdate(
      { _id: new ObjectId(id), 'addedBy.userId': userId },
      { $set: updateData },
      { returnDocument: 'after' }
    );
  },

  async decrementAvailableCopies(id: string, session?: ClientSession) {
    return getBooksCollection().updateOne(
      {
        _id: new ObjectId(id),
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
        $set: { updatedAt: new Date() },
      },
      { session }
    );
  },

  async incrementAvailableCopies(id: string, session?: ClientSession) {
    return getBooksCollection().updateOne(
      {
        _id: new ObjectId(id),
        $expr: {
          $lt: ['$availableCopies', '$totalCopies'],
        },
      },
      {
        $inc: { availableCopies: 1 },
        $set: { updatedAt: new Date() },
      },
      { session }
    );
  },

  async delete(id: string, userId: string) {
    return getBooksCollection().deleteOne({
      _id: new ObjectId(id),
      'addedBy.userId': userId,
      $expr: { $eq: ['$availableCopies', '$totalCopies'] },
    });
  },
};
