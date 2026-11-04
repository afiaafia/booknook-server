import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAtlasMongoUri,
  assertLoopbackMongoUri,
  createOpenLibraryUpsertOperations,
  fetchOpenLibraryBooks,
  mapOpenLibraryDocs,
} from '../../scripts/seed-open-library.js';

function subjectsResponse(works: unknown[]) {
  return new Response(JSON.stringify({ works }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const categoryWorks = {
  fiction: [{
    key: '/works/OL101W',
    title: 'The Fiction Book',
    authors: [{ name: 'Fiction Author' }],
    subject: ['novels', 'fiction'],
  }],
  science: [{
    key: '/works/OL102W',
    title: 'The Science Book',
    authors: [{ name: 'Science Author' }],
    subject: ['physics', 'science'],
  }],
  history: [{
    key: '/works/OL103W',
    title: 'The History Book',
    authors: [{ name: 'History Author' }],
    subject: ['history'],
  }],
  juvenile_fiction: [{
    key: '/works/OL104W',
    title: 'The Kids Book',
    authors: [{ name: 'Kids Author' }],
    subject: ['juvenile fiction', 'children'],
  }],
};

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

  it('maps works to the Book shape and marks them as catalogue books', () => {
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

  it('uses a fallback cover and ignores invalid work keys', () => {
    const books = mapOpenLibraryDocs([
      { key: '/works/OL456W', title: 'No Cover', author_name: ['Reader'] },
      { key: '/books/OL789M', title: 'Not a work key' },
    ]);

    assert.equal(books.length, 1);
    assert.equal(
      books[0]?.image,
      'https://placehold.co/300x450?text=Cover+Unavailable'
    );
  });

  it('creates safe insert and catalogue-only metadata update operations', () => {
    const [book] = mapOpenLibraryDocs([
      {
        key: '/works/OL123W',
        title: 'The Seeded Story',
        subject: ['fiction'],
      },
    ]);

    assert.ok(book);

    const operations = createOpenLibraryUpsertOperations([book]);

    assert.equal(operations.length, 2);

    assert.deepEqual(operations[0]?.updateOne.filter, {
      openLibraryKey: '/works/OL123W',
    });
    assert.deepEqual(operations[0]?.updateOne.update, {
      $setOnInsert: book,
    });
    assert.equal(operations[0]?.updateOne.upsert, true);

    const update = operations[1]?.updateOne;
    assert.deepEqual(update?.filter, {
      openLibraryKey: '/works/OL123W',
      'addedBy.userId': 'system:openlibrary',
    });
    assert.equal(update?.upsert, false);

    const fields = update?.update.$set as Record<string, unknown>;
    assert.equal(fields?.category, 'Fiction');
    assert.equal(fields?.title, 'The Seeded Story');
    assert.equal('totalCopies' in fields, false);
    assert.equal('availableCopies' in fields, false);
    assert.equal('addedBy' in fields, false);
    assert.equal('createdAt' in fields, false);
  });

  it('fetches all four categories and maps their books', async () => {
    const requestedSubjects: string[] = [];

    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const subject = url.pathname.split('/').at(-1)?.replace('.json', '');

      assert.ok(subject);
      requestedSubjects.push(subject);

      return subjectsResponse(
        categoryWorks[subject as keyof typeof categoryWorks] ?? []
      );
    };

    const books = await fetchOpenLibraryBooks(fetchImpl);

    assert.deepEqual(requestedSubjects.sort(), [
      'fiction',
      'history',
      'juvenile_fiction',
      'science',
    ]);

    assert.equal(books.length, 4);

    const categories = new Map(
      books.map((book) => [book.openLibraryKey, book.category])
    );

    assert.equal(categories.get('/works/OL101W'), 'Fiction');
    assert.equal(categories.get('/works/OL102W'), 'Science');
    assert.equal(categories.get('/works/OL103W'), 'History');
    assert.equal(categories.get('/works/OL104W'), 'Kids');
  });

  it('deduplicates the same Open Library work across subject endpoints', async () => {
    const sharedWork = {
      key: '/works/OL200W',
      title: 'Shared Book',
      authors: [{ name: 'A. Writer' }],
      subject: ['fiction'],
    };

    const fetchImpl: typeof fetch = async () =>
      subjectsResponse([sharedWork]);

    const books = await fetchOpenLibraryBooks(fetchImpl);

    assert.equal(books.length, 1);
    assert.equal(books[0]?.openLibraryKey, '/works/OL200W');
  });

  it('retries temporary subject API failures', async () => {
    const calls = new Map<string, number>();
    const delays: number[] = [];

    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const subject = url.pathname.split('/').at(-1) ?? '';
      const count = (calls.get(subject) ?? 0) + 1;
      calls.set(subject, count);

      if (subject === 'science.json' && count === 1) {
        return new Response('temporarily unavailable', { status: 503 });
      }

      const key = subject.replace('.json', '') as keyof typeof categoryWorks;
      return subjectsResponse(categoryWorks[key] ?? []);
    };

    const books = await fetchOpenLibraryBooks(fetchImpl, {
      maxAttempts: 2,
      retryDelayMs: 125,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    assert.equal(books.length, 4);
    assert.equal(calls.get('science.json'), 2);
    assert.deepEqual(delays, [125]);
  });

  it('reports a subject API failure instead of silently returning partial data', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));

      if (url.pathname.includes('/science.json')) {
        return new Response('Science backend unavailable', { status: 502 });
      }

      return subjectsResponse([]);
    };

    await assert.rejects(
      fetchOpenLibraryBooks(fetchImpl, {
        maxAttempts: 1,
        sleep: async () => undefined,
      }),
      /Open Library science Subjects API returned HTTP 502/
    );
  });
});
