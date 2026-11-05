import type { Collection, OptionalId } from "mongodb";

import { getDatabase } from "./database.js";
import type { Book } from "../modules/books/book.types.js";
import type { Borrow } from "../modules/borrows/borrow.types.js";
import type { Rating } from "../modules/ratings/rating.types.js";

export const getCollections = () => {
  const db = getDatabase();

  return {
    books: db.collection<OptionalId<Book>>("books"),
    borrows: db.collection<OptionalId<Borrow>>("borrows"),
    ratings: db.collection<OptionalId<Rating>>("ratings"),
  };
};

export type BookCollection = Collection<OptionalId<Book>>;
export type BorrowCollection = Collection<OptionalId<Borrow>>;
export type RatingCollection = Collection<OptionalId<Rating>>;
