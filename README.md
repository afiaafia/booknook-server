# BookNook API

A RESTful backend API for **BookNook**, a modern library management platform. It provides secure authentication integration, book catalogue management, borrowing operations, image uploads, and database management.

**Live API:** https://booknook-server-9lg6.onrender.com  
**Client Repository:** https://github.com/afiaafia/booknook-client

---

## Features

- **Book Management** – Create, retrieve, update, and manage book records.
- **Borrowing System** – Handle book borrowing operations and ownership rules.
- **Authentication** – Secure request authentication with Better Auth integration.
- **Image Uploads** – Upload and manage book images through ImgBB.
- **Request Validation** – Validate incoming requests using Zod.
- **Database Management** – MongoDB integration with optimized database indexes.
- **Error Handling** – Centralized error handling and structured logging.
- **Automated Testing** – Tests for books, borrowing, authentication, and uploads.

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express 5 |
| Database | MongoDB |
| Authentication | Better Auth |
| Validation | Zod |
| Image Hosting | ImgBB |
| Logging | Pino |
| Testing | Node.js Test Runner |
| Package Manager | pnpm |

## Project Structure

```text
booknook-server/
├── scripts/
│   └── seed-open-library.ts
├── src/
│   ├── config/
│   ├── middleware/
│   ├── modules/
│   │   ├── books/
│   │   ├── borrows/
│   │   └── uploads/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── books/
│   ├── borrows/
│   ├── middleware/
│   └── uploads/
├── .env.example
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js
- pnpm
- MongoDB database
- ImgBB API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/afiaafia/booknook-server.git
cd booknook-server
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env` file in the project root using `.env.example` as a reference.

4. Configure the environment variables:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
LOG_LEVEL=info

MONGODB_URI=your_mongodb_connection_string
DB_NAME=your_database_name
IMGBB_API_KEY=your_imgbb_api_key
```

5. Start the development server:

```bash
pnpm dev
```

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Start production server |
| `pnpm test` | Run automated tests |
| `pnpm typecheck` | Check TypeScript types |
| `pnpm seed` | Preview Open Library seed data |
| `pnpm seed:apply` | Apply seed data to an eligible local database |

## Open Library Seed

BookNook includes an Open Library seeding utility that fetches up to 25 fiction works using the Open Library Search API.

The default command:

```bash
pnpm seed
```

- Fetches book metadata from Open Library.
- Uses bounded retries and request timeouts.
- Falls back to the fiction Subjects API if Search is unavailable.
- Displays a dry-run preview without writing to MongoDB.

### Applying Seed Data

The write operation is intentionally restricted to a loopback MongoDB hostname.

```powershell
$env:BOOKNOOK_SEED_CONFIRM = 'local-database-write'
pnpm seed:apply
```

**Important:** Only use this command with an isolated, disposable local database. The script refuses remote MongoDB hosts. Never run it against a shared or production database.

## Deployment

The backend is deployed on **Render**.

**Production API:** https://booknook-server-9lg6.onrender.com

Production environment variables must be configured in the Render dashboard. Never commit actual credentials, API keys, or `.env` files to GitHub.

## Related Repository

- [BookNook Client](https://github.com/afiaafia/booknook-client)

---

## Author

**Afia Mubassira**

- [GitHub](https://github.com/afiaafia)
- [LinkedIn](https://linkedin.com/in/afia-afia)

---

*BookNook — A modern approach to library management.*
