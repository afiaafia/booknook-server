import assert from 'node:assert/strict';
import { ObjectId, type ClientSession } from 'mongodb';
import { describe, it } from 'node:test';

import { createBorrowService } from '../../src/modules/borrows/borrow.service.js';
import type { Borrow } from '../../src/modules/borrows/borrow.types.js';
import type { Book } from '../../src/modules/books/book.types.js';

const bookId = '507f1f77bcf86cd799439011';
const borrowId = '507f1f77bcf86cd799439012';
const book = {
  _id: new ObjectId(bookId),
  title: 'Test Book',
  image: 'https://images.example.test/book.png',
} as Book;

function makeSession(
  withTransaction: (operation: () => Promise<void>) => Promise<void> = async (
    operation
  ) => operation()
) {
  return {
    withTransaction,
    endSession: async () => undefined,
  } as unknown as ClientSession;
}

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const calls = {
    decrement: 0,
    create: 0,
    markReturned: 0,
    markActive: 0,
    increment: 0,
  };
  const session = makeSession();
  const dependencies = {
    getMongoClient: () => ({ startSession: () => session }),
    bookRepository: {
      findById: async () => book,
      decrementAvailableCopies: async () => {
        calls.decrement += 1;
        return { modifiedCount: 1 };
      },
      incrementAvailableCopies: async () => {
        calls.increment += 1;
        return { modifiedCount: 1 };
      },
    },
    borrowRepository: {
      findByUser: async () => [],
      findActiveByUserAndBook: async () => null,
      create: async () => {
        calls.create += 1;
        return new ObjectId(borrowId);
      },
      findById: async () =>
        ({
          _id: new ObjectId(borrowId),
          bookId: new ObjectId(bookId),
          userId: 'reader-id',
          status: 'active',
        }) as Borrow,
      markReturned: async () => {
        calls.markReturned += 1;
        return { _id: new ObjectId(borrowId), status: 'returned' } as Borrow;
      },
      markActive: async () => {
        calls.markActive += 1;
        return { _id: new ObjectId(borrowId), status: 'active' } as Borrow;
      },
    },
  };

  return {
    calls,
    dependencies: {
      ...dependencies,
      ...overrides,
      bookRepository: {
        ...dependencies.bookRepository,
        ...(overrides.bookRepository as object | undefined),
      },
      borrowRepository: {
        ...dependencies.borrowRepository,
        ...(overrides.borrowRepository as object | undefined),
      },
    },
  };
}

const reader = { id: 'reader-id', email: 'reader@example.test' };
const request = { bookId, returnDate: new Date(Date.now() + 86_400_000) };
const unsupportedTransactionError = Object.assign(
  new Error(
    'Transaction numbers are only allowed on a replica set member or mongos'
  ),
  { code: 20, codeName: 'IllegalOperation' }
);

describe('borrow service', () => {
  it('creates a borrow and reserves one available copy', async () => {
    const { calls, dependencies } = makeDependencies();
    const service = createBorrowService(dependencies as never);

    const result = await service.borrowBook(request, reader);

    assert.equal(result.borrowId.toString(), borrowId);
    assert.equal(calls.decrement, 1);
    assert.equal(calls.create, 1);
  });

  it('blocks duplicate active borrows before changing inventory', async () => {
    const existing = { _id: new ObjectId(borrowId) } as Borrow;
    const { calls, dependencies } = makeDependencies({
      borrowRepository: { findActiveByUserAndBook: async () => existing },
    });
    const service = createBorrowService(dependencies as never);

    await assert.rejects(service.borrowBook(request, reader), {
      code: 'BOOK_ALREADY_BORROWED',
    });
    assert.equal(calls.decrement, 0);
  });

  it('creates a borrow on MongoDB without transaction support', async () => {
    const { calls, dependencies } = makeDependencies({
      getMongoClient: () => ({
        startSession: () =>
          makeSession(async () => {
            throw unsupportedTransactionError;
          }),
      }),
    });
    const service = createBorrowService(dependencies as never);

    const result = await service.borrowBook(request, reader);

    assert.equal(result.borrowId.toString(), borrowId);
    assert.equal(calls.decrement, 1);
    assert.equal(calls.create, 1);
  });

  it('restores book availability when standalone borrow creation fails', async () => {
    const { calls, dependencies } = makeDependencies({
      getMongoClient: () => ({
        startSession: () =>
          makeSession(async () => {
            throw unsupportedTransactionError;
          }),
      }),
      borrowRepository: {
        create: async () => {
          throw Object.assign(new Error('duplicate key'), { code: 11000 });
        },
      },
    });
    const service = createBorrowService(dependencies as never);

    await assert.rejects(service.borrowBook(request, reader), {
      code: 'BOOK_ALREADY_BORROWED',
    });
    assert.equal(calls.decrement, 1);
    assert.equal(calls.increment, 1);
  });

  it('does not create a borrow when no copies remain', async () => {
    const { calls, dependencies } = makeDependencies({
      bookRepository: {
        decrementAvailableCopies: async () => ({ modifiedCount: 0 }),
      },
    });
    const service = createBorrowService(dependencies as never);

    await assert.rejects(service.borrowBook(request, reader), {
      code: 'BOOK_UNAVAILABLE',
    });
    assert.equal(calls.create, 0);
  });

  it('marks a borrow returned and restores one copy', async () => {
    const { calls, dependencies } = makeDependencies();
    const service = createBorrowService(dependencies as never);

    const result = await service.returnBook(borrowId, reader.id);

    assert.equal(result.status, 'returned');
    assert.equal(calls.markReturned, 1);
    assert.equal(calls.increment, 1);
  });

  it('returns a borrow on MongoDB without transaction support', async () => {
    const { calls, dependencies } = makeDependencies({
      getMongoClient: () => ({
        startSession: () =>
          makeSession(async () => {
            throw unsupportedTransactionError;
          }),
      }),
    });
    const service = createBorrowService(dependencies as never);

    const result = await service.returnBook(borrowId, reader.id);

    assert.equal(result.status, 'returned');
    assert.equal(calls.markReturned, 1);
    assert.equal(calls.increment, 1);
  });

  it('prevents one user from returning another user’s borrow', async () => {
    const { calls, dependencies } = makeDependencies({
      borrowRepository: {
        findById: async () =>
          ({
            _id: new ObjectId(borrowId),
            bookId: new ObjectId(bookId),
            userId: 'different-reader',
            status: 'active',
          }) as Borrow,
      },
    });
    const service = createBorrowService(dependencies as never);

    await assert.rejects(service.returnBook(borrowId, reader.id), {
      code: 'FORBIDDEN',
    });
    assert.equal(calls.markReturned, 0);
    assert.equal(calls.increment, 0);
  });
});
