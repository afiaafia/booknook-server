import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';

import { bookController } from './book.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';

import {
  createBookSchema,
  updateBookSchema,
  bookIdSchema,
  listBooksQuerySchema,
} from './book.validation.js';

export const bookRoutes: ExpressRouter = Router();

// Public routes
bookRoutes.get(
  '/',
  validateRequest(listBooksQuerySchema),
  bookController.getAllBooks
);

bookRoutes.get('/latest', bookController.getLatestBooks);

bookRoutes.get('/me', authenticate, bookController.getMyBooks);

bookRoutes.get(
  '/:id',
  validateRequest(bookIdSchema),
  bookController.getBookById
);

// Protected routes
bookRoutes.post(
  '/',
  authenticate,
  validateRequest(createBookSchema),
  bookController.createBook
);

bookRoutes.patch(
  '/:id',
  authenticate,
  validateRequest(updateBookSchema),
  bookController.updateBook
);

bookRoutes.delete(
  '/:id',
  authenticate,
  validateRequest(bookIdSchema),
  bookController.deleteBook
);
