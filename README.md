# Testtoria.ai

Testtoria.ai is an AI-assisted QA automation platform for creating, editing, generating, running, and reviewing manual and Playwright automation test cases.

The app includes a React frontend, an Express/Prisma backend, local SQLite persistence, AI-assisted test case and script generation, selector inspection, Playwright execution, run history, screenshots, and bug tracking.

## Features

- User registration and login
- API key creation and revocation for AI endpoints
- Manual test case creation, editing, deletion, and bulk deletion
- Structured automation steps with selectors, actions, values, assertions, and expected values
- AI-generated manual test cases from stories, acceptance criteria, feature descriptions, or documents
- AI refinement for shrinking, expanding, deduplicating, or scoping generated test cases
- AI-generated Playwright scripts from saved test cases
- Editable generated scripts before save and before run
- Selector Finder for inspecting websites and attaching selectors to test case steps
- Playwright sandbox runner with screenshots and readable failure logs
- Test run history and failure details
- Bug tracking linked to failed test runs
- Dashboard summary for tests, runs, and failures

## Tech Stack

| Area | Stack |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS, React Router, Axios |
| Backend | Node.js, Express, Prisma |
| Database | SQLite by default, PostgreSQL-ready through Prisma |
| Automation | Playwright |
| AI Providers | Ollama by default, OpenAI optional |

## Project Structure

```text
qualiqoai/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── runner/
│   │   ├── services/
│   │   ├── utils/
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── utils/
│   │   └── App.jsx
│   ├── .env.example
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- npm 9+
- Playwright Chromium browser
- Ollama, if using local AI generation

## Quick Start

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Configure backend environment

```bash
cp .env.example .env
```

For local frontend compatibility, use port `3001`:

```env
HOST=127.0.0.1
PORT=3001
DATABASE_URL="file:./dev.db"
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

OpenAI can be used instead:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o-mini
```

### 3. Prepare the database

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

### 4. Install Playwright browser

```bash
npx playwright install chromium
```

### 5. Start the backend

```bash
PORT=3001 npm start
```

Backend health check:

```bash
curl http://127.0.0.1:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "app": "Testtoria.ai",
  "version": "1.0.0"
}
```

### 6. Install frontend dependencies

Open a second terminal:

```bash
cd frontend
npm install
```

### 7. Configure frontend environment

```bash
cp .env.example .env
```

Expected local config:

```env
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_APP_NAME=Testtoria.ai
```

### 8. Start the frontend

```bash
npm run dev
```

Open the app at:

```text
http://127.0.0.1:5173
```

## Local AI With Ollama

Start Ollama:

```bash
ollama serve
```

Pull a model if needed:

```bash
ollama pull llama3.1
```

The backend reads:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

## Authentication and API Keys

The UI supports registration and login. After logging in:

1. Go to Settings -> API Keys.
2. Create a Testtoria API key.
3. The frontend stores the selected key locally and sends it to protected AI endpoints.

AI endpoints require a valid Testtoria API key.

## Core Workflows

### Generate manual test cases

1. Open Test Cases.
2. Paste a feature description, user story, acceptance criteria, or document.
3. Choose input type, coverage level, and desired count.
4. Generate test cases.
5. Edit, shrink, expand, deduplicate, add manually, or add more with AI.
6. Select the cases to save.

### Create automation-ready test cases

Each test step can include:

- Description
- Selector
- Action type, such as `navigate`, `click`, `fill`, `select`, `hover`, `check`, `press`
- Action value, when needed
- Assertion type, such as `isVisible`, `hasText`, `containsText`, `hasURL`, `hasTitle`
- Expected assertion value, when needed

### Generate and edit Playwright scripts

1. Open a saved test case.
2. Generate a Playwright script.
3. Edit the script in the UI.
4. Save the script.
5. Run the latest saved script.

### Use Selector Finder

1. Open Selector Finder.
2. Enter a website URL and target elements.
3. Generate selector recommendations.
4. Use a selector in a test case step.
5. Generate a Playwright script from the selector-backed steps.

### Review run failures

Failed runs include:

- Clear failure summary
- Failed selector or action when detected
- Likely cause
- Next check guidance
- Screenshot
- Readable timeline
- Raw logs for debugging

## Backend Scripts

Run these inside `backend/`.

| Command | Description |
| --- | --- |
| `npm start` | Start the backend |
| `npm run dev` | Start with nodemon |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push Prisma schema to the database |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio |
| `npm run setup` | Install dependencies, generate Prisma client, push schema, and seed |

## Frontend Scripts

Run these inside `frontend/`.

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production assets |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## API Overview

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Backend health check |

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register a user |
| `POST` | `/api/auth/login` | Login and receive a local auth token |

### API Keys

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/api-keys/create` | Create a Testtoria API key |
| `GET` | `/api/api-keys` | List active keys |
| `DELETE` | `/api/api-keys/:id` | Revoke a key |

### Test Cases

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/tests` | List test cases |
| `GET` | `/api/tests/:id` | Get one test case |
| `POST` | `/api/tests` | Create a test case |
| `POST` | `/api/tests/bulk-create` | Create multiple test cases |
| `PUT` | `/api/tests/:id` | Update a test case |
| `PATCH` | `/api/tests/:id/script` | Update the generated script |
| `DELETE` | `/api/tests/:id` | Delete one test case |
| `DELETE` | `/api/tests/bulk-delete` | Delete multiple test cases |
| `POST` | `/api/tests/:id/run` | Run the saved Playwright script |

### AI

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/ai/generate-testcases` | Generate manual test cases from a feature |
| `POST` | `/api/ai/generate-testcases-from-doc` | Generate detailed manual test cases from document content |
| `POST` | `/api/ai/refine-testcases` | Shrink, expand, deduplicate, or scope generated test cases |
| `POST` | `/api/ai/generate-script` | Generate a Playwright script |
| `POST` | `/api/ai/generate-script-from-recording` | Generate a Playwright script from recorded actions |
| `POST` | `/api/ai/inspect-selector` | Inspect one selector target |
| `POST` | `/api/ai/inspect-selectors` | Inspect multiple selector targets |
| `POST` | `/api/ai/generate-and-run` | Generate and run from content |
| `POST` | `/api/ai/map-testcases-to-scripts` | Generate scripts for multiple test cases |

### Runs, Bugs, and Dashboard

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/runs` | List run history |
| `GET` | `/api/runs/:id` | Get one run with logs |
| `DELETE` | `/api/runs/:id` | Delete a run |
| `GET` | `/api/bugs` | List bugs |
| `GET` | `/api/bugs/:id` | Get one bug |
| `POST` | `/api/bugs` | Create a bug |
| `PUT` | `/api/bugs/:id` | Update a bug |
| `DELETE` | `/api/bugs/:id` | Delete a bug |
| `GET` | `/api/dashboard/summary` | Dashboard totals |

## Example API Requests

### Register

```bash
curl -X POST http://127.0.0.1:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA User",
    "email": "qa@example.com",
    "password": "Password123!"
  }'
```

### Create a test case

```bash
curl -X POST http://127.0.0.1:3001/api/tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Homepage smoke test",
    "description": "Verify the homepage loads",
    "url": "https://example.com",
    "steps": [
      {
        "description": "Open homepage",
        "action": "navigate",
        "value": "https://example.com",
        "assertion": "hasTitle",
        "expectedValue": "Example Domain"
      }
    ],
    "priority": "high",
    "type": "Positive",
    "module": "Homepage"
  }'
```

### Generate test cases from a story

```bash
curl -X POST http://127.0.0.1:3001/api/ai/generate-testcases-from-doc \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <testtoria-api-key>" \
  -d '{
    "content": "As a buyer, I want to upload a CSV file for bulk returns. Invalid rows should show row-level errors.",
    "type": "story",
    "count": 5,
    "coverageLevel": "standard"
  }'
```

### Run a test

```bash
curl -X POST http://127.0.0.1:3001/api/tests/<test-case-id>/run
```

## Data Model Notes

- `TestCase.steps` is stored as a JSON string in the database.
- Steps can be old plain-text strings or structured automation step objects.
- `TestCase.script` stores the latest generated or edited Playwright script.
- `TestRun.logs` is stored as JSON text and parsed by the frontend.
- Screenshots are served from `/screenshots`.

## Troubleshooting

### `127.0.0.1 refused to connect`

Check that the backend is running on the same port used by `frontend/.env`.

```bash
cd backend
PORT=3001 npm start
curl http://127.0.0.1:3001/health
```

### `Route not found` on `/health`

Use:

```text
http://127.0.0.1:3001/health
```

Do not include `/api` for the health endpoint.

### `Unauthorized` from AI endpoints

AI routes require a Testtoria API key. Create one in Settings -> API Keys, then use it as:

```text
Authorization: Bearer <testtoria-api-key>
```

### Ollama port already in use

Check the process using port `11434`:

```bash
lsof -nP -iTCP:11434 -sTCP:LISTEN
```

If Ollama is already running, keep it running and use the existing service.

### Playwright browser missing

Install Chromium:

```bash
cd backend
npx playwright install chromium
```

### Generated script fails with selector timeout

Use Selector Finder to get a stable selector, attach it to the failed step, regenerate or edit the script, then run again.

## Development Notes

- Keep backend and frontend running in separate terminals.
- Use SQLite for quick local development.
- Use PostgreSQL by changing `DATABASE_URL` in `backend/.env`.
- Generated test cases and scripts are editable before saving or running.
- The runner uses the latest saved script from the database when a test is executed.

