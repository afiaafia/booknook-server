import { getCollections } from './collections.js';
import { logger } from './logger.js';

export const createDatabaseIndexes = async (): Promise<void> => {
  const { books, borrows } = getCollections();

  await Promise.all([
    // Books: newest books first
    books.createIndex({ createdAt: -1 }, { name: 'books_created_at_desc' }),

    // Books: filter by category and sort by date
    books.createIndex(
      { category: 1, createdAt: -1 },
      { name: 'books_category_created_at' }
    ),

    // Books: find books belonging to a specific owner
    books.createIndex(
      { 'addedBy.userId': 1, createdAt: -1 },
      { name: 'books_owner_created_at' }
    ),

    // Keep imported Open Library works idempotent without constraining user books.
    books.createIndex(
      { openLibraryKey: 1 },
      {
        name: 'books_open_library_key_unique',
        unique: true,
        partialFilterExpression: { openLibraryKey: { $type: 'string' } },
      }
    ),

    // Borrows: find a user's borrowing history
    borrows.createIndex(
      { userId: 1, createdAt: -1 },
      { name: 'borrows_user_created_at' }
    ),

    // Borrows: find active borrowing records
    borrows.createIndex(
      { userId: 1, status: 1 },
      { name: 'borrows_user_status' }
    ),

    // Prevent the same user from actively borrowing
    // the same book more than once.
    borrows.createIndex(
      { bookId: 1, userId: 1 },
      {
        name: 'borrows_unique_active_user_book',
        unique: true,
        partialFilterExpression: {
          status: 'active',
        },
      }
    ),
  ]);

  logger.info('MongoDB indexes created successfully');
};
