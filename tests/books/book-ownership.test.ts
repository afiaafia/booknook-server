import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bookRepository } from '../../src/modules/books/book.repository.js';
import { bookService } from '../../src/modules/books/book.service.js';
import type { Book } from '../../src/modules/books/book.types.js';

const book = {
  _id: '507f1f77bcf86cd799439011',
  addedBy: { userId: 'owner-id', name: 'Owner', email: 'owner@example.test' },
  totalCopies: 2,
  availableCopies: 2,
} as unknown as Book;

describe('book ownership checks', () => {
  it('rejects edits by a non-owner before reaching the update repository', async () => {
    const findById = bookRepository.findById;
    const update = bookRepository.update;
    bookRepository.findById = async () => book;
    bookRepository.update = async () => {
      throw new Error('Repository update must not run for a non-owner');
    };

    try {
      await assert.rejects(
        bookService.updateBook(
          book._id.toString(),
          { title: 'Changed' },
          'other-id'
        ),
        { code: 'FORBIDDEN' }
      );
    } finally {
      bookRepository.findById = findById;
      bookRepository.update = update;
    }
  });

  it('rejects deletion by a non-owner before reaching the delete repository', async () => {
    const findById = bookRepository.findById;
    const remove = bookRepository.delete;
    bookRepository.findById = async () => book;
    bookRepository.delete = async () => {
      throw new Error('Repository delete must not run for a non-owner');
    };

    try {
      await assert.rejects(
        bookService.deleteBook(book._id.toString(), 'other-id'),
        { code: 'FORBIDDEN' }
      );
    } finally {
      bookRepository.findById = findById;
      bookRepository.delete = remove;
    }
  });

  it('rejects reducing total copies below the number currently borrowed', async () => {
    const borrowedBook = { ...book, availableCopies: 1 };
    const findById = bookRepository.findById;
    const update = bookRepository.update;
    let updateCalled = false;

    bookRepository.findById = async () => borrowedBook;
    bookRepository.update = async () => {
      updateCalled = true;
      return null;
    };

    try {
      await assert.rejects(
        bookService.updateBook(
          book._id.toString(),
          { totalCopies: 0 },
          'owner-id'
        ),
        { code: 'INSUFFICIENT_TOTAL_COPIES' }
      );

      assert.equal(updateCalled, false);
    } finally {
      bookRepository.findById = findById;
      bookRepository.update = update;
    }
  });

  it('prevents deleting a book while copies are borrowed', async () => {
    const borrowedBook = { ...book, availableCopies: 1 };
    const findById = bookRepository.findById;
    const remove = bookRepository.delete;
    let deleteCalled = false;

    bookRepository.findById = async () => borrowedBook;
    bookRepository.delete = async () => {
      deleteCalled = true;
      return { deletedCount: 1 } as never;
    };

    try {
      await assert.rejects(
        bookService.deleteBook(book._id.toString(), 'owner-id'),
        { code: 'BOOK_HAS_ACTIVE_BORROWS' }
      );

      assert.equal(deleteCalled, false);
    } finally {
      bookRepository.findById = findById;
      bookRepository.delete = remove;
    }
  });

  it('reports a conflict when a book changes during an update', async () => {
    const findById = bookRepository.findById;
    const update = bookRepository.update;
    let findCalls = 0;

    bookRepository.findById = async () => {
      findCalls += 1;
      return book;
    };
    bookRepository.update = async () => null;

    try {
      await assert.rejects(
        bookService.updateBook(
          book._id.toString(),
          { title: 'Updated title' },
          'owner-id'
        ),
        { code: 'BOOK_UPDATE_CONFLICT' }
      );

      assert.equal(findCalls, 2);
    } finally {
      bookRepository.findById = findById;
      bookRepository.update = update;
    }
  });
});
