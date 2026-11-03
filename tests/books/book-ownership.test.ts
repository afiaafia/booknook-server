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
});
