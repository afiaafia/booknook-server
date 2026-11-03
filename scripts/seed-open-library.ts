import type { Book, BookCategory } from '../src/modules/books/book.types.js';

const SEARCH_URL = 'https://openlibrary.org/search.json';
const SUBJECTS_URL = 'https://openlibrary.org/subjects/fiction.json';
const RESULT_LIMIT = 25;
const FALLBACK_COVER = 'https://placehold.co/300x450?text=Cover+Unavailable';
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const CATALOG_USER = {
  userId: 'system:openlibrary',
  name: 'Open Library Catalog',
  email: 'catalog@booknook.invalid',
};

export interface OpenLibraryDoc {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  cover_i?: unknown;
  first_publish_year?: unknown;
  subject?: unknown;
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
}

interface OpenLibrarySubjectWork {
  key?: unknown;
  title?: unknown;
  authors?: unknown;
  cover_id?: unknown;
  first_publish_year?: unknown;
  subject?: unknown;
}

interface OpenLibrarySubjectsResponse {
  works?: OpenLibrarySubjectWork[];
}

export interface FetchOpenLibraryOptions {
  maxAttempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export type SeedBook = Omit<Book, '_id'>;

class OpenLibraryRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'OpenLibraryRequestError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function retryDelay(response: Response, attempt: number, baseDelay: number) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(retryAt) && retryAt >= 0) {
      return Math.min(retryAt, MAX_RETRY_DELAY_MS);
    }
  }

  return Math.min(baseDelay * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

async function fetchWithRetry(
  url: URL,
  label: string,
  fetchImpl: typeof fetch,
  options: Required<FetchOpenLibraryOptions> & { headers: HeadersInit }
): Promise<Response> {
  let lastError: OpenLibraryRequestError | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      lastError = new OpenLibraryRequestError(
        `Open Library ${label} request failed: ${errorMessage(error)}`,
        undefined,
        true
      );
      if (attempt === options.maxAttempts) throw lastError;
      await options.sleep(options.retryDelayMs * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) return response;

    const body = (await response.text())
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    const detail = body ? `: ${body}` : '';
    const retryable = response.status === 429 || response.status >= 500;
    lastError = new OpenLibraryRequestError(
      `Open Library ${label} returned HTTP ${response.status}${detail}`,
      response.status,
      retryable
    );

    if (!retryable || attempt === options.maxAttempts) throw lastError;
    await options.sleep(retryDelay(response, attempt, options.retryDelayMs));
  }

  throw lastError ?? new Error(`Open Library ${label} request failed`);
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(
      `Open Library ${label} returned invalid JSON: ${errorMessage(error)}`
    );
  }
}

function mapSubjectWorks(works: OpenLibrarySubjectWork[]): OpenLibraryDoc[] {
  return works.map((work) => ({
    key: work.key,
    title: work.title,
    author_name: Array.isArray(work.authors)
      ? work.authors.flatMap((author) =>
          typeof author === 'object' && author !== null && 'name' in author
            ? [author.name]
            : []
        )
      : undefined,
    cover_i: work.cover_id,
    first_publish_year: work.first_publish_year,
    subject: work.subject,
  }));
}

function categoryFromSubjects(subjects: string[]): BookCategory {
  const text = subjects.join(' ').toLowerCase();
  if (/juvenile|children|young adult|picture books/.test(text)) return 'Kids';
  if (/science|physics|biology|chemistry|mathematics|technology/.test(text)) {
    return 'Science';
  }
  if (/history|historical/.test(text)) return 'History';
  if (/fiction|novel|fantasy|mystery|romance|science fiction/.test(text)) {
    return 'Fiction';
  }
  return 'Others';
}

export function mapOpenLibraryDocs(docs: OpenLibraryDoc[]): SeedBook[] {
  const booksByKey = new Map<string, SeedBook>();

  for (const doc of docs) {
    if (
      typeof doc.key !== 'string' ||
      !/^\/works\/OL\d+W$/.test(doc.key) ||
      typeof doc.title !== 'string' ||
      doc.title.trim().length < 2
    ) {
      continue;
    }

    const title = doc.title.trim().slice(0, 150);
    const authors = Array.isArray(doc.author_name)
      ? doc.author_name.filter(
          (author): author is string => typeof author === 'string'
        )
      : [];
    const author = (authors[0]?.trim() || 'Unknown author').slice(0, 100);
    const subjects = Array.isArray(doc.subject)
      ? doc.subject
          .filter((subject): subject is string => typeof subject === 'string')
          .slice(0, 4)
          .map((subject) => subject.trim().slice(0, 100))
          .filter(Boolean)
      : [];
    const year =
      typeof doc.first_publish_year === 'number' &&
      Number.isInteger(doc.first_publish_year)
        ? doc.first_publish_year
        : undefined;
    const coverId =
      typeof doc.cover_i === 'number' &&
      Number.isInteger(doc.cover_i) &&
      doc.cover_i > 0
        ? doc.cover_i
        : undefined;
    const descriptionParts = [
      year ? `First published in ${year}.` : '',
      subjects.length ? `Subjects: ${subjects.join(', ')}.` : '',
    ].filter(Boolean);

    booksByKey.set(doc.key, {
      title,
      author,
      category: categoryFromSubjects(subjects),
      image: coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
        : FALLBACK_COVER,
      openLibraryKey: doc.key,
      description:
        descriptionParts.join(' ') ||
        `Imported from the Open Library catalog: ${title}.`,
      totalCopies: 2,
      availableCopies: 2,
      addedBy: CATALOG_USER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return [...booksByKey.values()];
}

export async function fetchOpenLibraryBooks(
  fetchImpl: typeof fetch = fetch,
  options: FetchOpenLibraryOptions = {}
): Promise<SeedBook[]> {
  const contact = process.env.OPENLIBRARY_CONTACT_EMAIL;
  const userAgent = contact
    ? `BookNook/1.0 (Open Library catalog seed; contact: ${contact})`
    : 'BookNook/1.0 (Open Library catalog seed)';
  const requestOptions: Required<FetchOpenLibraryOptions> & {
    headers: HeadersInit;
  } = {
    maxAttempts: options.maxAttempts ?? MAX_ATTEMPTS,
    timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
    retryDelayMs: options.retryDelayMs ?? INITIAL_RETRY_DELAY_MS,
    sleep:
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
    },
  };

  const searchUrl = new URL(SEARCH_URL);
  searchUrl.searchParams.set('q', 'fiction');
  searchUrl.searchParams.set('limit', String(RESULT_LIMIT));
  searchUrl.searchParams.set(
    'fields',
    'key,title,author_name,cover_i,first_publish_year'
  );

  try {
    const response = await fetchWithRetry(
      searchUrl,
      'Search API',
      fetchImpl,
      requestOptions
    );
    const payload = await readJson<OpenLibraryResponse>(response, 'Search API');
    if (!Array.isArray(payload.docs)) {
      throw new Error('Open Library Search API returned an invalid response');
    }

    return mapOpenLibraryDocs(payload.docs).slice(0, RESULT_LIMIT);
  } catch (error) {
    if (!(error instanceof OpenLibraryRequestError) || !error.retryable) {
      throw error;
    }

    const subjectsUrl = new URL(SUBJECTS_URL);
    subjectsUrl.searchParams.set('limit', String(RESULT_LIMIT));
    try {
      const response = await fetchWithRetry(
        subjectsUrl,
        'Subjects API fallback',
        fetchImpl,
        requestOptions
      );
      const payload = await readJson<OpenLibrarySubjectsResponse>(
        response,
        'Subjects API fallback'
      );
      if (!Array.isArray(payload.works)) {
        throw new Error(
          'Open Library Subjects API returned an invalid response'
        );
      }

      return mapOpenLibraryDocs(mapSubjectWorks(payload.works)).slice(
        0,
        RESULT_LIMIT
      );
    } catch (fallbackError) {
      throw new Error(
        `Open Library Search API failed (${errorMessage(error)}); Subjects API fallback failed (${errorMessage(fallbackError)})`,
        { cause: fallbackError }
      );
    }
  }
}

export function createOpenLibraryUpsertOperations(books: SeedBook[]) {
  return books.map((book) => ({
    updateOne: {
      filter: { openLibraryKey: book.openLibraryKey },
      update: { $setOnInsert: book },
      upsert: true,
    },
  }));
}

export function assertLoopbackMongoUri(uri: string): void {
  let hostname: string;
  try {
    const authority = uri.match(/^mongodb(?:\+srv)?:\/\/([^/?#]+)/i)?.[1];
    if (
      !authority ||
      authority.slice(authority.lastIndexOf('@') + 1).includes(',')
    ) {
      throw new Error('non-local or multi-host MongoDB URI');
    }
    hostname = new URL(uri).hostname.toLowerCase();
  } catch {
    throw new Error('Seed apply requires a valid local MongoDB URI');
  }

  const isLoopback =
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('127.');
  if (!isLoopback) {
    throw new Error('Seed apply is restricted to a loopback MongoDB host');
  }
}

async function applySeed(books: SeedBook[]): Promise<void> {
  if (process.env.BOOKNOOK_SEED_CONFIRM !== 'local-database-write') {
    throw new Error(
      'Set BOOKNOOK_SEED_CONFIRM=local-database-write to confirm an isolated local database write'
    );
  }

  const { env } = await import('../src/config/env.js');
  assertLoopbackMongoUri(env.MONGODB_URI);

  const [
    { connectDatabase, closeDatabase },
    { getCollections },
    { createDatabaseIndexes },
  ] = await Promise.all([
    import('../src/config/database.js'),
    import('../src/config/collections.js'),
    import('../src/config/database-indexes.js'),
  ]);

  await connectDatabase();
  try {
    await createDatabaseIndexes();
    const result = await getCollections().books.bulkWrite(
      createOpenLibraryUpsertOperations(books),
      { ordered: false }
    );
    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          attempted: books.length,
          inserted: result.upsertedCount,
          alreadyPresent: result.matchedCount,
        },
        null,
        2
      )
    );
  } finally {
    await closeDatabase();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  if (args.some((arg) => arg !== '--apply' && arg !== '--dry-run')) {
    throw new Error('Supported arguments are --dry-run and --apply');
  }

  const books = await fetchOpenLibraryBooks();
  if (books.length === 0) {
    throw new Error('Open Library returned no usable books');
  }

  if (apply) {
    await applySeed(books);
    return;
  }

  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        fetched: books.length,
        inserted: 0,
        databaseConnected: false,
        preview: books.slice(0, 5).map((book) => ({
          openLibraryKey: book.openLibraryKey,
          title: book.title,
          author: book.author,
          category: book.category,
          image: book.image,
          totalCopies: book.totalCopies,
          availableCopies: book.availableCopies,
          catalogueBook: book.addedBy.userId === CATALOG_USER.userId,
        })),
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.includes('seed-open-library')) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Open Library seed failed'
    );
    process.exitCode = 1;
  });
}
