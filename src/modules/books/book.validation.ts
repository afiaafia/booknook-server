import { z } from "zod";

import { BOOK_CATEGORIES } from "./book.types.js";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid book ID");

export const createBookSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(2, "Book title must be at least 2 characters")
      .max(150, "Book title cannot exceed 150 characters"),

    author: z
      .string()
      .trim()
      .min(2, "Author name must be at least 2 characters")
      .max(100, "Author name cannot exceed 100 characters"),

    category: z.enum(BOOK_CATEGORIES),

    image: z
      .url("Please provide a valid book image URL"),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .max(2000, "Description cannot exceed 2000 characters"),

    totalCopies: z
      .number()
      .int("Total copies must be a whole number")
      .min(1, "At least one copy is required")
      .max(10000, "Total copies cannot exceed 10000"),
  }).strict(),
});

export const updateBookSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),

  body: z.object({
    title: z.string().trim().min(2).max(150).optional(),

    author: z.string().trim().min(2).max(100).optional(),

    category: z.enum(BOOK_CATEGORIES).optional(),

    image: z.url().optional(),

    description: z.string().trim().min(10).max(2000).optional(),

    totalCopies: z.number().int().min(1).max(10000).optional(),
  }).strict().refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update",
  ),
});

export const bookIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const listBooksQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(50).default(12),

    search: z.string().trim().max(100).optional(),

    category: z.enum(BOOK_CATEGORIES).optional(),

    sort: z
      .enum(["newest", "oldest", "title-asc", "title-desc"])
      .default("newest"),
  }),
});

export type CreateBookRequest = z.infer<
  typeof createBookSchema
>["body"];

export type UpdateBookRequest = z.infer<
  typeof updateBookSchema
>["body"];

export type ListBooksQuery = z.infer<
  typeof listBooksQuerySchema
>["query"];
