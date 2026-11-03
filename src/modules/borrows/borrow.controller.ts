import type { RequestHandler } from "express";

import { borrowService } from "./borrow.service.js";

import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import type { CreateBorrowRequest } from "./borrow.validation.js";

type BorrowController = {
  getMyBorrows: RequestHandler;
  borrowBook: RequestHandler;
  returnBook: RequestHandler;
};

export const borrowController: BorrowController = {
  getMyBorrows: (async (_req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;

    const borrows = await borrowService.getMyBorrows(user.id);

    res.status(200).json({
      success: true,
      message: "Borrowing history retrieved successfully",
      data: borrows,
    });
  }),

  borrowBook: (async (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;

    const result = await borrowService.borrowBook(
      req.body as CreateBorrowRequest,
      {
        id: user.id,
        email: user.email,
      },
    );

    res.status(201).json({
      success: true,
      message: "Book borrowed successfully",
      data: result,
    });
  }),

  returnBook: (async (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;

    const borrow = await borrowService.returnBook(
      req.params.id as string,
      user.id,
    );

    res.status(200).json({
      success: true,
      message: "Book returned successfully",
      data: borrow,
    });
  }),
};
