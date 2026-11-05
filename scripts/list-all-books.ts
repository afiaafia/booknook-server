import { MongoClient } from "mongodb";
import "dotenv/config";

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MongoDB connection URI not found in environment variables.");
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db("booknook");
    const collections = await db.listCollections().toArray();

    console.log("\nAvailable collections:");
    collections.forEach((collection) => console.log(`- ${collection.name}`));

    const candidates = ["books", "catalogBooks", "catalog_books"];
    let books: any[] = [];

    for (const name of candidates) {
      if (collections.some((collection) => collection.name === name)) {
        books = await db.collection(name).find({}).toArray();
        if (books.length) {
          console.log(`\nUsing collection: ${name}`);
          break;
        }
      }
    }

    if (!books.length) {
      throw new Error("No books found in the expected collections. Check the collection names above.");
    }

    const output = books
      .map((book, index) => {
        const title = book.title ?? book.name ?? "Untitled";
        const author = book.author ?? "Unknown author";
        return `${String(index + 1).padStart(3, "0")}. ${title} — ${author}`;
      })
      .join("\n");

    console.log(`\nTotal books: ${books.length}\n`);
    console.log(output);

    const fs = await import("node:fs/promises");
    await fs.writeFile("all-catalogue-books.txt", output + "\n", "utf8");
    console.log("\nSaved to all-catalogue-books.txt");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
