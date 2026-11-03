import { bookRepository } from './book.repository.js';

import type { CreateBookInput, UpdateBookInput } from './book.types.js';

import type { ListBooksQuery } from './book.validation.js';

import { AppError } from '../../utils/app-error.js';

export const bookService = {
  async getAllBooks(query: ListBooksQuery) {
    return bookRepository.findAll(query);
  },

  async getLatestBooks(limit = 6) {
    return bookRepository.findLatest(limit);
  },

  async getBookById(id: string) {
    const book = await bookRepository.findById(id);

    if (!book) {
      throw new AppError('Book not found', 404, 'BOOK_NOT_FOUND');
    }

    return book;
  },

  async getBooksByOwner(userId: string) {
    return bookRepository.findByOwner(userId);
  },

  async createBook(input: CreateBookInput) {
    return bookRepository.create(input);
  },

  async updateBook(id: string, input: UpdateBookInput, userId: string) {
    const existingBook = await this.getBookById(id);

    if (existingBook.addedBy.userId !== userId) {
      throw new AppError(
        'You cannot update a book added by another user',
        403,
        'FORBIDDEN'
      );
    }

    if (input.totalCopies !== undefined) {
      const borrowedCopies =
        existingBook.totalCopies - existingBook.availableCopies;

      if (input.totalCopies < borrowedCopies) {
        throw new AppError(
          'Total copies cannot be less than currently borrowed copies',
          409,
          'INSUFFICIENT_TOTAL_COPIES'
        );
      }
    }

    const updatedBook = await bookRepository.update(id, userId, input);

    if (!updatedBook) {
      const currentBook = await bookRepository.findById(id);
      if (!currentBook) {
        throw new AppError('Book not found', 404, 'BOOK_NOT_FOUND');
      }
      if (currentBook.addedBy.userId !== userId) {
        throw new AppError(
          'You cannot update a book added by another user',
          403,
          'FORBIDDEN'
        );
      }
      throw new AppError(
        'The book changed while it was being updated. Refresh and try again.',
        409,
        'BOOK_UPDATE_CONFLICT'
      );
    }

    return updatedBook;
  },

  async deleteBook(id: string, userId: string) {
    const existingBook = await this.getBookById(id);

    if (existingBook.addedBy.userId !== userId) {
      throw new AppError(
        'You cannot delete a book added by another user',
        403,
        'FORBIDDEN'
      );
    }

    if (existingBook.availableCopies !== existingBook.totalCopies) {
      throw new AppError(
        'A book cannot be deleted while copies are borrowed',
        409,
        'BOOK_HAS_ACTIVE_BORROWS'
      );
    }

    const result = await bookRepository.delete(id, userId);

    if (result.deletedCount === 0) {
      const currentBook = await bookRepository.findById(id);
      if (!currentBook) {
        throw new AppError('Book not found', 404, 'BOOK_NOT_FOUND');
      }
      if (currentBook.addedBy.userId !== userId) {
        throw new AppError(
          'You cannot delete a book added by another user',
          403,
          'FORBIDDEN'
        );
      }
      throw new AppError(
        'A book cannot be deleted while copies are borrowed',
        409,
        'BOOK_HAS_ACTIVE_BORROWS'
      );
    }

    return result;
  },
};
