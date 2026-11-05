async function main() {
  const { connectDatabase, closeDatabase } =
    await import('../src/config/database.js');
  const { getCollections } =
    await import('../src/config/collections.js');

  await connectDatabase();

  try {
    const books = getCollections().books;

    const records = await books.find(
      { 'addedBy.userId': 'system:openlibrary' },
      {
        projection: {
          title: 1,
          author: 1,
          openLibraryKey: 1,
          createdAt: 1,
          addedBy: 1,
        },
      }
    ).toArray();

    console.log(JSON.stringify({
      totalCatalogBooks: records.length,
      books: records.map(book => ({
        title: book.title,
        author: book.author,
        openLibraryKey: book.openLibraryKey,
        createdAt: book.createdAt,
      })),
    }, null, 2));
  } finally {
    await closeDatabase();
  }
}

main().catch(console.error);
