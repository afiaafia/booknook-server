import type { RequestHandler } from 'express';

import { bookService } from './book.service.js';
import type { AuthenticatedUser } from '../../middleware/authenticate.js';

import type {
  CreateBookRequest,
  UpdateBookRequest,
  ListBooksQuery,
} from './book.validation.js';

type BookController = {
  getAllBooks: RequestHandler;
  getLatestBooks: RequestHandler;
  getMyBooks: RequestHandler;
  getBookById: RequestHandler;
  createBook: RequestHandler;
  updateBook: RequestHandler;
  deleteBook: RequestHandler;
};

export const bookController: BookController = {
  getAllBooks: async (req, res) => {
    const validatedRequest = res.locals.validatedRequest as {
      query: ListBooksQuery;
    };
    const result = await bookService.getAllBooks(validatedRequest.query);

    res.status(200).json({
      success: true,
      message: 'Books retrieved successfully',
      data: result,
    });
  },

  getLatestBooks: async (_req, res) => {
    const books = await bookService.getLatestBooks();

    res.status(200).json({
      success: true,
      message: 'Latest books retrieved successfully',
      data: books,
    });
  },

  getMyBooks: async (_req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    const books = await bookService.getBooksByOwner(user.id);

    res.status(200).json({
      success: true,
      message: 'Your books retrieved successfully',
      data: books,
    });
  },

  getBookById: async (req, res) => {
    const book = await bookService.getBookById(req.params.id as string);

    res.status(200).json({
      success: true,
      message: 'Book retrieved successfully',
      data: book,
    });
  },

  createBook: async (req, res) => {
    const input = req.body as CreateBookRequest;
    const user = res.locals.authUser as AuthenticatedUser;

    const bookId = await bookService.createBook({
      ...input,
      availableCopies: input.totalCopies,
      addedBy: {
        userId: user.id,
        name: user.name,
        email: user.email,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Book created successfully',
      data: { bookId },
    });
  },

  updateBook: async (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    const updatedBook = await bookService.updateBook(
      req.params.id as string,
      req.body as UpdateBookRequest,
      user.id
    );

    res.status(200).json({
      success: true,
      message: 'Book updated successfully',
      data: updatedBook,
    });
  },

  deleteBook: async (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    await bookService.deleteBook(req.params.id as string, user.id);

    res.status(200).json({
      success: true,
      message: 'Book deleted successfully',
    });
  },
};
