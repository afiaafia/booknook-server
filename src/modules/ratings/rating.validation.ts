import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid book ID');

export const bookRatingParamsSchema = z.object({
  params: z.object({
    bookId: objectIdSchema,
  }),
});

export const submitRatingSchema = z.object({
  params: z.object({
    bookId: objectIdSchema,
  }),
  body: z.object({
    rating: z.number().int().min(1).max(5),
  }).strict(),
});

export type SubmitRatingRequest = z.infer<
  typeof submitRatingSchema
>['body'];
