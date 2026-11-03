import type { ObjectId } from "mongodb";

export type BorrowStatus = "active" | "returned";

export interface Borrow {
  _id: ObjectId;
  bookId: ObjectId;
  bookTitle: string;
  bookImage: string;
  userId: string;
  userEmail: string;
  borrowDate: Date;
  returnDate: Date;
  returnedAt: Date | null;
  status: BorrowStatus;
  createdAt: Date;
  updatedAt: Date;
}
