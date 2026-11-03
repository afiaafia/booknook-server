import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid book ID");

export const createBorrowSchema = z.object({
  body: z.object({
    bookId: objectIdSchema,
    returnDate: z.coerce.date().refine(
      (date) => date > new Date(),
      "Return date must be in the future",
    ),
  }).strict(),
});

export const borrowIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export type CreateBorrowRequest = z.infer<
  typeof createBorrowSchema
>["body"];
