# BookNook API

## Open Library Seed

`pnpm seed` fetches up to 25 fiction works from the Open Library Search API and prints a dry-run preview. It does not import the database connector or connect to MongoDB. The primary request uses the confirmed `key,title,author_name,cover_i,first_publish_year` fields, with a timeout and bounded retries for transient failures. If Search remains unavailable, it falls back to the fiction Subjects API and maps its equivalent work, author, cover, year, and subject fields. If both endpoints fail, the command reports both errors rather than returning an empty catalogue. Requests identify as `BookNook/1.0`; optionally set `OPENLIBRARY_CONTACT_EMAIL` to include a project contact address in the User-Agent.

Imported covers use Open Library's medium cover URL when available and a placeholder otherwise. Imported rows use the existing `Book` model, a stable `openLibraryKey`, the system catalogue owner `system:openlibrary`, and two initial copies. A unique partial index plus `$setOnInsert` upserts prevents duplicates while leaving user-created books unaffected. The current My Books query filters by the authenticated user's ID and therefore excludes catalogue entries.

The write command is intentionally separate and restricted to a loopback MongoDB hostname:

```powershell
$env:BOOKNOOK_SEED_CONFIRM = 'local-database-write'
pnpm seed:apply
```

Before using `seed:apply`, independently confirm the local MongoDB instance and selected database are isolated and disposable. The script refuses remote MongoDB hosts. Do not run it against a shared or production database. No database write is needed to verify the default dry-run.
