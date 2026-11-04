import type { ObjectId } from 'mongodb';

export const BOOK_CATEGORIES = [
  'Fiction',
  'Romance',
  'Science',
  'History',
  'Kids',
  'Others',
] as const;

export type BookCategory = (typeof BOOK_CATEGORIES)[number];

export interface Book {
  _id: ObjectId;
  title: string;
  author: string;
  category: BookCategory;
  image: string;
  openLibraryKey?: string;
  description: string;
  totalCopies: number;
  availableCopies: number;
  addedBy: {
    userId: string;
    name: string;
    email: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type CreateBookInput = Omit<Book, '_id' | 'createdAt' | 'updatedAt'>;

export type UpdateBookInput = Partial<CreateBookInput>;
