# Testtoria.ai — Backend Setup Guide

## Prerequisites

| Tool | Min Version |
|------|-------------|
| Node.js | 18+ |
| npm | 9+ |
| Playwright browsers | installed via `npx playwright install chromium` |

---

## Quick Start (SQLite — zero config)

```bash
cd backend

# 1. Install all dependencies
npm install

# 2. Install the Chromium browser Playwright needs
npx playwright install chromium

# 3. Copy env (SQLite is the default — no DB server needed)
cp .env.example .env

# 4. Create DB schema + generate Prisma client
npx prisma db push

# 5. Seed with sample data (3 test cases, 2 runs, 1 bug)
node prisma/seed.js

# 6. Start the dev server (auto-restarts on changes)
npm run dev
```

Server starts at **http://localhost:3000**

---

## Switch to PostgreSQL

Edit `.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/testtoria?schema=public"
```

Then run:

```bash
npx prisma db push
node prisma/seed.js
```

---

## Folder Structure

```
backend/
├── prisma/
│   ├── schema.prisma        # DB models: TestCase, TestRun, Bug
│   └── seed.js              # Sample data loader
├── src/
│   ├── server.js            # Express app entry point
│   ├── controllers/
│   │   ├── testCaseController.js  # CRUD for test cases
│   │   ├── testRunController.js   # Run history + trigger
│   │   ├── bugController.js       # Bug CRUD
│   │   └── aiController.js        # Mock script generator
│   ├── routes/
│   │   ├── testCases.js
│   │   ├── testRuns.js
│   │   ├── bugs.js
│   │   └── ai.js
│   ├── services/
│   │   └── testRunService.js      # Orchestrates execution + auto-bug
│   ├── runner/
│   │   └── playwrightRunner.js    # Headless Chromium executor
│   ├── middleware/
│   │   └── errorHandler.js
│   └── utils/
│       └── prisma.js              # Prisma singleton client
├── uploads/
│   └── screenshots/         # Failure screenshots saved here
├── .env
├── .env.example
└── package.json
```

---

## API Reference

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server status |

### Test Cases
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tests` | List all (filter: `?status=&priority=&search=`) |
| `GET` | `/api/tests/:id` | Single test case + last 10 runs |
| `POST` | `/api/tests` | Create test case |
| `PUT` | `/api/tests/:id` | Update test case |
| `DELETE` | `/api/tests/:id` | Delete (cascades runs + bugs) |
| `POST` | `/api/tests/:id/run` | **Execute** test → pass/fail + stored logs |

### Test Run History
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/runs` | All runs (filter: `?testCaseId=&status=&limit=&offset=`) |
| `GET` | `/api/runs/:id` | Single run with parsed logs array |
| `DELETE` | `/api/runs/:id` | Delete run |

### Bugs
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/bugs` | All bugs (filter: `?status=&severity=&testCaseId=`) |
| `GET` | `/api/bugs/:id` | Single bug |
| `POST` | `/api/bugs` | Create bug manually |
| `PUT` | `/api/bugs/:id` | Update (status, severity, notes) |
| `DELETE` | `/api/bugs/:id` | Delete bug |

### AI
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ai/generate-script` | Generate (mock) Playwright script from test case |

---

## Example Requests

### Create a test case
```bash
curl -X POST http://localhost:3000/api/tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Check about page",
    "url": "https://example.com/about",
    "steps": ["Navigate to about page", "Verify heading exists"],
    "priority": "medium"
  }'
```

### Generate a Playwright script (AI placeholder)
```bash
curl -X POST http://localhost:3000/api/ai/generate-script \
  -H "Content-Type: application/json" \
  -d '{ "testCaseId": "<id-from-above>" }'
```

### Run a test
```bash
curl -X POST http://localhost:3000/api/tests/<id>/run
```

### Get run history with logs
```bash
curl http://localhost:3000/api/runs?testCaseId=<id>
```

---

## How Execution Works

1. `POST /api/tests/:id/run` calls `testRunService.executeTest()`
2. A `TestRun` row is created with `status: "running"`
3. `playwrightRunner.runScript()` launches headless Chromium, executes the stored script string
4. The script has access to `page` (Playwright), `log(msg)`, and `expect(value, msg)`
5. On completion, the `TestRun` is updated: `status`, `duration`, `logs`, `screenshot`, `error`
6. If the run **failed**, a `Bug` record is automatically created

---

## npm Scripts

| Script | Action |
|--------|--------|
| `npm run dev` | Start with nodemon (auto-restart) |
| `npm start` | Start in production mode |
| `npm run db:push` | Sync schema to DB |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:seed` | Load seed data |
| `npm run db:studio` | Open Prisma Studio (GUI) |

---

## Swap in Real AI (OpenAI)

1. Add your key to `.env`: `OPENAI_API_KEY=sk-...`
2. In `src/controllers/aiController.js`, replace `buildMockScript()` with an OpenAI `chat.completions.create()` call — the stub is already annotated with where to plug it in.
