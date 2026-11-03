import { ObjectId } from 'mongodb';

import { getMongoClient } from '../../config/database.js';
import { bookRepository } from '../books/book.repository.js';
import { borrowRepository } from './borrow.repository.js';

import { AppError } from '../../utils/app-error.js';

import type { CreateBorrowRequest } from './borrow.validation.js';
import type { Borrow } from './borrow.types.js';

interface BorrowingUser {
  id: string;
  email: string;
}

function isTransactionUnsupportedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 20 &&
    typeof candidate.message === 'string' &&
    candidate.message.includes(
      'Transaction numbers are only allowed on a replica set member or mongos'
    )
  );
}

type BorrowServiceDependencies = {
  getMongoClient: typeof getMongoClient;
  bookRepository: Pick<
    typeof bookRepository,
    'findById' | 'decrementAvailableCopies' | 'incrementAvailableCopies'
  >;
  borrowRepository: Pick<
    typeof borrowRepository,
    | 'findByUser'
    | 'findActiveByUserAndBook'
    | 'create'
    | 'findById'
    | 'markReturned'
    | 'markActive'
  >;
};

export function createBorrowService(
  dependencies: BorrowServiceDependencies = {
    getMongoClient,
    bookRepository,
    borrowRepository,
  }
) {
  const { getMongoClient, bookRepository, borrowRepository } = dependencies;
  const borrowWithoutTransaction = async (
    input: CreateBorrowRequest,
    user: BorrowingUser
  ) => {
    const book = await bookRepository.findById(input.bookId);
    if (!book) {
      throw new AppError('Book not found', 404, 'BOOK_NOT_FOUND');
    }

    const existingBorrow = await borrowRepository.findActiveByUserAndBook(
      user.id,
      input.bookId
    );
    if (existingBorrow) {
      throw new AppError(
        'You have already borrowed this book',
        409,
        'BOOK_ALREADY_BORROWED'
      );
    }

    const reservation = await bookRepository.decrementAvailableCopies(
      input.bookId
    );
    if (reservation.modifiedCount === 0) {
      throw new AppError('No copies available', 409, 'BOOK_UNAVAILABLE');
    }

    try {
      const borrowId = await borrowRepository.create({
        bookId: new ObjectId(input.bookId),
        bookTitle: book.title,
        bookImage: book.image,
        userId: user.id,
        userEmail: user.email,
        borrowDate: new Date(),
        returnDate: input.returnDate,
        returnedAt: null,
        status: 'active',
      });

      return { borrowId };
    } catch (error) {
      const restoration = await bookRepository.incrementAvailableCopies(
        input.bookId
      );
      if (restoration.modifiedCount === 0) {
        throw new AppError(
          'Could not restore book availability after a failed borrow',
          500,
          'COPY_RESTORATION_FAILED'
        );
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new AppError(
          'You have already borrowed this book',
          409,
          'BOOK_ALREADY_BORROWED'
        );
      }
      throw error;
    }
  };

  const returnWithoutTransaction = async (id: string, userId: string) => {
    const borrow = await borrowRepository.findById(id);
    if (!borrow) {
      throw new AppError('Borrow record not found', 404, 'BORROW_NOT_FOUND');
    }

    if (borrow.userId !== userId) {
      throw new AppError(
        "You cannot return another user's borrow record",
        403,
        'FORBIDDEN'
      );
    }

    if (borrow.status !== 'active') {
      throw new AppError(
        'This book has already been returned',
        409,
        'ALREADY_RETURNED'
      );
    }

    const returned = await borrowRepository.markReturned(id, userId);
    if (!returned) {
      throw new AppError(
        'This book has already been returned',
        409,
        'ALREADY_RETURNED'
      );
    }

    try {
      const restoration = await bookRepository.incrementAvailableCopies(
        borrow.bookId.toString()
      );
      if (restoration.modifiedCount === 0) {
        throw new AppError(
          'Could not restore book availability',
          409,
          'COPY_RESTORATION_FAILED'
        );
      }

      return returned;
    } catch (error) {
      const restored = await borrowRepository.markActive(id, userId);
      if (!restored) {
        throw new AppError(
          'Could not restore the borrow after a failed return',
          500,
          'BORROW_RESTORATION_FAILED'
        );
      }
      throw error;
    }
  };

  return {
    async getMyBorrows(userId: string) {
      return borrowRepository.findByUser(userId);
    },

    async borrowBook(input: CreateBorrowRequest, user: BorrowingUser) {
      const session = getMongoClient().startSession();
      let borrowId: ObjectId | null = null;
      try {
        await session.withTransaction(async () => {
          const book = await bookRepository.findById(input.bookId, session);
          if (!book) {
            throw new AppError('Book not found', 404, 'BOOK_NOT_FOUND');
          }

          const existingBorrow = await borrowRepository.findActiveByUserAndBook(
            user.id,
            input.bookId,
            session
          );
          if (existingBorrow) {
            throw new AppError(
              'You have already borrowed this book',
              409,
              'BOOK_ALREADY_BORROWED'
            );
          }

          const reservation = await bookRepository.decrementAvailableCopies(
            input.bookId,
            session
          );
          if (reservation.modifiedCount === 0) {
            throw new AppError('No copies available', 409, 'BOOK_UNAVAILABLE');
          }

          borrowId = await borrowRepository.create(
            {
              bookId: new ObjectId(input.bookId),
              bookTitle: book.title,
              bookImage: book.image,
              userId: user.id,
              userEmail: user.email,
              borrowDate: new Date(),
              returnDate: input.returnDate,
              returnedAt: null,
              status: 'active',
            },
            session
          );
        });

        if (!borrowId) {
          throw new AppError(
            'Could not complete the borrowing request',
            500,
            'BORROW_CREATE_FAILED'
          );
        }

        return { borrowId };
      } catch (error) {
        if (isTransactionUnsupportedError(error)) {
          return await borrowWithoutTransaction(input, user);
        }

        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000
        ) {
          throw new AppError(
            'You have already borrowed this book',
            409,
            'BOOK_ALREADY_BORROWED'
          );
        }

        throw error;
      } finally {
        await session.endSession();
      }
    },

    async returnBook(id: string, userId: string) {
      const session = getMongoClient().startSession();
      let updatedBorrow: Borrow | null = null;

      try {
        await session.withTransaction(async () => {
          const borrow = await borrowRepository.findById(id, session);
          if (!borrow) {
            throw new AppError(
              'Borrow record not found',
              404,
              'BORROW_NOT_FOUND'
            );
          }

          if (borrow.userId !== userId) {
            throw new AppError(
              "You cannot return another user's borrow record",
              403,
              'FORBIDDEN'
            );
          }

          if (borrow.status !== 'active') {
            throw new AppError(
              'This book has already been returned',
              409,
              'ALREADY_RETURNED'
            );
          }

          const returned = await borrowRepository.markReturned(
            id,
            userId,
            session
          );
          if (!returned) {
            throw new AppError(
              'This book has already been returned',
              409,
              'ALREADY_RETURNED'
            );
          }

          const restoration = await bookRepository.incrementAvailableCopies(
            borrow.bookId.toString(),
            session
          );
          if (restoration.modifiedCount === 0) {
            throw new AppError(
              'Could not restore book availability',
              409,
              'COPY_RESTORATION_FAILED'
            );
          }

          updatedBorrow = returned;
        });

        if (!updatedBorrow) {
          throw new AppError(
            'Could not complete the return request',
            500,
            'BORROW_RETURN_FAILED'
          );
        }

        return updatedBorrow;
      } catch (error) {
        if (isTransactionUnsupportedError(error)) {
          return await returnWithoutTransaction(id, userId);
        }

        throw error;
      } finally {
        await session.endSession();
      }
    },
  };
}

export const borrowService = createBorrowService();
