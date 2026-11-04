import type { Book, BookCategory } from '../src/modules/books/book.types.js';

const SEARCH_URL = 'https://openlibrary.org/search.json';
const SUBJECT_ENDPOINTS = [
  { subject: 'fiction', category: 'Fiction' },
  { subject: 'romance', category: 'Romance' },
  { subject: 'science', category: 'Science' },
  { subject: 'history', category: 'History' },
  { subject: 'juvenile_fiction', category: 'Kids' },
] as const;
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

function categoryFromSubjects(
  subjects: string[],
  fallback: BookCategory = 'Others'
): BookCategory {
  const text = subjects.join(' ').toLowerCase();

  if (/juvenile|children|young adult|picture books/.test(text)) {
    return 'Kids';
  }

  if (/romance|romantic|love stories|love story/.test(text)) {
    return 'Romance';
  }

  // Science fiction is a fiction genre, not a science subject.
  if (/science fiction|sci-fi/.test(text)) {
    return 'Fiction';
  }

  if (/history|historical|biography|autobiography/.test(text)) {
    return 'History';
  }

  if (/physics|biology|chemistry|mathematics|technology|science/.test(text)) {
    return 'Science';
  }

  if (/fiction|novel|fantasy|mystery|thriller|drama|tragedy/.test(text)) {
    return 'Fiction';
  }

  return fallback;
}

export function mapOpenLibraryDocs(
  docs: OpenLibraryDoc[],
  fallbackCategory: BookCategory = 'Others'
): SeedBook[] {
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
      category: categoryFromSubjects(subjects, fallbackCategory),
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

  const results = await Promise.all(
    SUBJECT_ENDPOINTS.map(async ({ subject, category }) => {
      const url = new URL(`https://openlibrary.org/subjects/${subject}.json`);
      url.searchParams.set('limit', String(RESULT_LIMIT));

      const response = await fetchWithRetry(
        url,
        `${subject} Subjects API`,
        fetchImpl,
        requestOptions
      );

      const payload = await readJson<OpenLibrarySubjectsResponse>(
        response,
        `${subject} Subjects API`
      );

      if (!Array.isArray(payload.works)) {
        throw new Error(
          `Open Library ${subject} Subjects API returned an invalid response`
        );
      }

      return mapOpenLibraryDocs(mapSubjectWorks(payload.works), category);
    })
  );

  const booksByKey = new Map<string, SeedBook>();

  for (const books of results) {
    for (const book of books) {
      const key = book.openLibraryKey;

      if (!key) continue;

      if (!booksByKey.has(key)) {
        booksByKey.set(key, book);
      }
    }
  }

  return [...booksByKey.values()];
}

export function createOpenLibraryUpsertOperations(books: SeedBook[]) {
  return books.flatMap((book) => {
    const {
      totalCopies,
      availableCopies,
      addedBy,
      createdAt,
      ...metadata
    } = book;

    return [
      {
        updateOne: {
          filter: { openLibraryKey: book.openLibraryKey },
          update: { $setOnInsert: book },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: {
            openLibraryKey: book.openLibraryKey,
            'addedBy.userId': CATALOG_USER.userId,
          },
          update: {
            $set: {
              ...metadata,
              updatedAt: new Date(),
            },
          },
          upsert: false,
        },
      },
    ];
  });
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


export function assertAtlasMongoUri(
  uri: string,
  databaseName: string
): void {
  const allowedHosts = new Set([
    'cluster0.6rsrqdq.mongodb.net',
    'ac-ovxrfpd-shard-00-00.6rsrqdq.mongodb.net',
    'ac-ovxrfpd-shard-00-01.6rsrqdq.mongodb.net',
    'ac-ovxrfpd-shard-00-02.6rsrqdq.mongodb.net',
  ]);

  if (databaseName !== 'booknook') {
    throw new Error('Atlas seed is restricted to the booknook database');
  }

  const isSrv = uri.startsWith('mongodb+srv://');
  const isStandard = uri.startsWith('mongodb://');

  if (!isSrv && !isStandard) {
    throw new Error('Atlas seed requires a valid MongoDB URI');
  }

  const remainder = uri.slice(isSrv ? 14 : 10);
  const authority = remainder.split('/')[0]?.split('?')[0] ?? '';
  const databasePath = remainder.includes('/')
    ? remainder.split('/')[1]?.split('?')[0] ?? ''
    : '';

  if (databasePath && databasePath !== 'booknook') {
    throw new Error('Atlas seed is restricted to the booknook database');
  }

  const hostList = authority
    .slice(authority.lastIndexOf('@') + 1)
    .split(',');

  const hosts = hostList.map((entry) => {
    const parts = entry.split(':');
    return {
      hostname: parts[0]?.toLowerCase(),
      port: parts[1],
      validParts: parts.length <= 2,
    };
  });

  if (
    hosts.length === 0 ||
    hosts.some(
      ({ hostname, port, validParts }) =>
        !validParts ||
        !hostname ||
        !allowedHosts.has(hostname) ||
        (isSrv && port !== undefined) ||
        (isStandard && port !== '27017')
    ) ||
    (isSrv &&
      (hosts.length !== 1 ||
        hosts[0]?.hostname !== 'cluster0.6rsrqdq.mongodb.net')) ||
    (isStandard && hosts.length !== 3)
  ) {
    throw new Error('Atlas seed is restricted to the approved Atlas cluster');
  }
}

async function applySeed(books: SeedBook[]): Promise<void> {
  const confirmation = process.env.BOOKNOOK_SEED_CONFIRM;

  const { env } = await import("../src/config/env.js");

  if (confirmation === "local-database-write") {
    assertLoopbackMongoUri(env.MONGODB_URI);
  } else if (confirmation === "atlas-booknook-write") {
    assertAtlasMongoUri(env.MONGODB_URI, env.DB_NAME);
  } else {
    throw new Error(
      "Set BOOKNOOK_SEED_CONFIRM to local-database-write or atlas-booknook-write"
    );
  }

  const [
    { connectDatabase, closeDatabase },
    { getCollections },
    { createDatabaseIndexes },
  ] = await Promise.all([
    import("../src/config/database.js"),
    import("../src/config/collections.js"),
    import("../src/config/database-indexes.js"),
  ]);

  await connectDatabase();
  try {
    await createDatabaseIndexes();

    const result = await getCollections().books.bulkWrite(
      createOpenLibraryUpsertOperations(books),
      { ordered: true }
    );

    console.log(
      JSON.stringify(
        {
          mode: "apply",
          database: env.DB_NAME,
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
