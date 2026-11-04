import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAtlasMongoUri,
  assertLoopbackMongoUri,
  createOpenLibraryUpsertOperations,
  fetchOpenLibraryBooks,
  mapOpenLibraryDocs,
} from '../../scripts/seed-open-library.js';

function searchResponse(docs: unknown[]) {
  return new Response(JSON.stringify({ docs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Open Library seed mapping', () => {
  it('only allows a single loopback MongoDB host for explicit writes', () => {
    assert.doesNotThrow(() =>
      assertLoopbackMongoUri('mongodb://localhost:27017/booknook')
    );
    assert.throws(() =>
      assertLoopbackMongoUri('mongodb+srv://remote.example/booknook')
    );
    assert.throws(() =>
      assertLoopbackMongoUri(
        'mongodb://localhost:27017,remote.example:27017/booknook'
      )
    );
  });

  it('only allows the approved Atlas cluster and booknook database', () => {
    assert.doesNotThrow(() =>
      assertAtlasMongoUri(
        'mongodb+srv://user:password@cluster0.6rsrqdq.mongodb.net/booknook',
        'booknook'
      )
    );

    assert.throws(() =>
      assertAtlasMongoUri(
        'mongodb+srv://user:password@other.mongodb.net/booknook',
        'booknook'
      )
    );

    assert.throws(() =>
      assertAtlasMongoUri(
        'mongodb+srv://user:password@cluster0.6rsrqdq.mongodb.net/other',
        'other'
      )
    );

    assert.throws(() =>
      assertAtlasMongoUri(
        'mongodb://localhost:27017/booknook',
        'booknook'
      )
    );
  });

  it('maps works to the existing Book shape and marks them as catalogue books', () => {
    const [book] = mapOpenLibraryDocs([
      {
        key: '/works/OL123W',
        title: 'The Seeded Story',
        author_name: ['A. Writer'],
        cover_i: 987,
        first_publish_year: 2001,
        subject: ['fiction', 'family'],
      },
    ]);

    assert.ok(book);
    assert.equal(book.openLibraryKey, '/works/OL123W');
    assert.equal(book.image, 'https://covers.openlibrary.org/b/id/987-M.jpg');
    assert.equal(book.totalCopies, 2);
    assert.equal(book.availableCopies, 2);
    assert.equal(book.addedBy.userId, 'system:openlibrary');
    assert.equal(book.category, 'Fiction');
    assert.match(book.description, /First published in 2001/);
  });

  it('uses a fallback cover and ignores duplicate or invalid work keys', () => {
    const books = mapOpenLibraryDocs([
      { key: '/works/OL456W', title: 'No Cover', author_name: ['Reader'] },
      {
        key: '/works/OL456W',
        title: 'No Cover (duplicate)',
        author_name: ['Reader'],
      },
      { key: '/books/OL789M', title: 'Not a work key' },
    ]);

    assert.equal(books.length, 1);
    assert.equal(
      books[0]?.image,
      'https://placehold.co/300x450?text=Cover+Unavailable'
    );
  });

  it('uses an idempotent set-on-insert upsert keyed by Open Library work', () => {
    const [book] = mapOpenLibraryDocs([
      { key: '/works/OL123W', title: 'The Seeded Story' },
    ]);
    assert.ok(book);

    const [operation] = createOpenLibraryUpsertOperations([book]);
    assert.ok(operation);
    assert.deepEqual(operation.updateOne.filter, {
      openLibraryKey: '/works/OL123W',
    });
    assert.equal(operation.updateOne.upsert, true);
    assert.deepEqual(operation.updateOne.update, { $setOnInsert: book });
  });

  it('fetches and maps works using the confirmed Search API fields', async () => {
    let requestUrl = '';
    let requestHeaders: Headers | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return searchResponse([
        {
          key: '/works/OL123W',
          title: 'The Seeded Story',
          author_name: ['A. Writer'],
          cover_i: 987,
          first_publish_year: 2001,
        },
      ]);
    };

    const books = await fetchOpenLibraryBooks(fetchImpl);

    assert.equal(
      requestUrl,
      'https://openlibrary.org/search.json?q=fiction&limit=25&fields=key%2Ctitle%2Cauthor_name%2Ccover_i%2Cfirst_publish_year'
    );
    assert.equal(requestHeaders?.get('Accept'), 'application/json');
    assert.equal(
      requestHeaders?.get('User-Agent'),
      'BookNook/1.0 (Open Library catalog seed)'
    );
    assert.equal(books.length, 1);
    assert.equal(books[0]?.title, 'The Seeded Story');
    assert.equal(books[0]?.author, 'A. Writer');
    assert.equal(
      books[0]?.image,
      'https://covers.openlibrary.org/b/id/987-M.jpg'
    );
    assert.equal(books[0]?.openLibraryKey, '/works/OL123W');
  });

  it('retries temporary Search API failures before returning books', async () => {
    let calls = 0;
    const delays: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response('temporarily unavailable', { status: 503 })
        : searchResponse([{ key: '/works/OL123W', title: 'The Seeded Story' }]);
    };

    const books = await fetchOpenLibraryBooks(fetchImpl, {
      maxAttempts: 2,
      retryDelayMs: 125,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    assert.equal(calls, 2);
    assert.deepEqual(delays, [125]);
    assert.equal(books[0]?.openLibraryKey, '/works/OL123W');
  });

  it('uses the Subjects API fallback and maps its response shape', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url.toString());
      if (url.pathname === '/search.json') {
        return new Response('Solr unavailable', { status: 500 });
      }

      return new Response(
        JSON.stringify({
          works: [
            {
              key: '/works/OL66554W',
              title: 'Pride and Prejudice',
              authors: [{ name: 'Jane Austen' }],
              cover_id: 14348537,
              first_publish_year: 1813,
              subject: ['Fiction', 'Romance'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const books = await fetchOpenLibraryBooks(fetchImpl, {
      maxAttempts: 1,
      sleep: async () => undefined,
    });

    assert.equal(requestedUrls.length, 2);
    assert.equal(
      requestedUrls[1],
      'https://openlibrary.org/subjects/fiction.json?limit=25'
    );
    assert.equal(books[0]?.author, 'Jane Austen');
    assert.equal(books[0]?.category, 'Fiction');
    assert.equal(
      books[0]?.image,
      'https://covers.openlibrary.org/b/id/14348537-M.jpg'
    );
    assert.equal(books[0]?.openLibraryKey, '/works/OL66554W');
  });

  it('reports both API failures instead of returning an empty catalogue', async () => {
    const fetchImpl: typeof fetch = async (input) =>
      new URL(String(input)).pathname === '/search.json'
        ? new Response('Search backend unavailable', { status: 500 })
        : new Response('Subjects backend unavailable', { status: 502 });

    await assert.rejects(
      fetchOpenLibraryBooks(fetchImpl, {
        maxAttempts: 1,
        sleep: async () => undefined,
      }),
      /Search API failed \(Open Library Search API returned HTTP 500: Search backend unavailable\); Subjects API fallback failed \(Open Library Subjects API fallback returned HTTP 502: Subjects backend unavailable\)/
    );
  });
});
