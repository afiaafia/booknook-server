import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';

import { borrowController } from './borrow.controller.js';

import { createBorrowSchema, borrowIdSchema } from './borrow.validation.js';

export const borrowRoutes: ExpressRouter = Router();

// All borrowing routes require authentication.
borrowRoutes.use(authenticate);

// Current user's borrowing history.
borrowRoutes.get('/', borrowController.getMyBorrows);

borrowRoutes.get('/me', borrowController.getMyBorrows);

// Borrow a book.
borrowRoutes.post(
  '/',
  validateRequest(createBorrowSchema),
  borrowController.borrowBook
);

// Return a borrowed book.
borrowRoutes.patch(
  '/:id/return',
  validateRequest(borrowIdSchema),
  borrowController.returnBook
);

// Assignment-compatible method; the PATCH route remains for the current client.
borrowRoutes.delete(
  '/:id',
  validateRequest(borrowIdSchema),
  borrowController.returnBook
);
