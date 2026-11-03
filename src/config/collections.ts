import type { Collection, OptionalId } from "mongodb";

import { getDatabase } from "./database.js";
import type { Book } from "../modules/books/book.types.js";
import type { Borrow } from "../modules/borrows/borrow.types.js";

export const getCollections = () => {
  const db = getDatabase();

  return {
    books: db.collection<OptionalId<Book>>("books"),
    borrows: db.collection<OptionalId<Borrow>>("borrows"),
  };
};

export type BookCollection = Collection<OptionalId<Book>>;
export type BorrowCollection = Collection<OptionalId<Borrow>>;
