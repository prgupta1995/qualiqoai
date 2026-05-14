/**
 * Copy local SQLite data into the configured PostgreSQL database.
 *
 * Usage:
 *   npm run db:seed:from-sqlite
 *   npm run db:seed:from-sqlite -- --clear
 *   npm run db:seed:from-sqlite -- --sqlite ./prisma/dev.db
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const clearTarget = args.includes('--clear');
const dryRun = args.includes('--dry-run');
let prisma;

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.PRISMA_DB_DATABASE_URL ||
  process.env.PRISMA_DB_POSTGRES_URL ||
  process.env.PRISMA_DB_PRISMA_DATABASE_URL;

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const sqlitePath = path.resolve(
  process.cwd(),
  getArgValue('--sqlite') || process.env.SQLITE_DATABASE_PATH || path.join('prisma', 'dev.db'),
);

function getArgValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function assertSetup() {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Set it to your PostgreSQL URL before running this seed script.',
    );
  }

  if (databaseUrl.startsWith('file:')) {
    throw new Error(
      'DATABASE_URL points to SQLite. Set DATABASE_URL to PostgreSQL and use --sqlite for the SQLite source file.',
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  }

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database not found: ${sqlitePath}`);
  }
}

function maskDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.username) url.username = '****';
    if (url.password) url.password = '****';
    return url.toString();
  } catch {
    return value.replace(/:\/\/[^@]+@/, '://****@');
  }
}

function readSqliteTable(tableName) {
  const result = spawnSync(
    'sqlite3',
    ['-json', sqlitePath, `SELECT * FROM "${tableName}"`],
    { encoding: 'utf8' },
  );

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(
        'sqlite3 CLI is required to read the local SQLite database. Install sqlite3 or run this on macOS where sqlite3 is available.',
      );
    }

    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Failed to read SQLite table ${tableName}: ${result.stderr.trim()}`);
  }

  const output = result.stdout.trim();
  return output ? JSON.parse(output) : [];
}

function optionalString(value) {
  return value === undefined || value === null ? null : String(value);
}

function requiredString(value, fallback) {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;

  const raw = String(value);
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? fallback : date;
}

function requiredDate(value) {
  return parseDate(value, new Date());
}

function optionalDate(value) {
  return parseDate(value, null);
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function mapUser(row) {
  return {
    id: requiredString(row.id, cryptoRandomId()),
    name: requiredString(row.name, 'User'),
    email: requiredString(row.email, `missing-email-${cryptoRandomId()}@local.test`),
    password: requiredString(row.password, ''),
    createdAt: requiredDate(row.createdAt),
    updatedAt: requiredDate(row.updatedAt || row.createdAt),
  };
}

function mapApiKey(row) {
  return {
    id: requiredString(row.id, cryptoRandomId()),
    userId: requiredString(row.userId, ''),
    name: requiredString(row.name, 'Imported API key'),
    keyHash: requiredString(row.keyHash, cryptoRandomId()),
    keyPreview: requiredString(row.keyPreview, 'tt_live_****'),
    createdAt: requiredDate(row.createdAt),
    lastUsedAt: optionalDate(row.lastUsedAt),
    isActive: parseBoolean(row.isActive, true),
  };
}

function mapTestCase(row) {
  return {
    id: requiredString(row.id, cryptoRandomId()),
    title: requiredString(row.title, 'Imported test case'),
    description: optionalString(row.description),
    preconditions: optionalString(row.preconditions),
    url: optionalString(row.url),
    steps: requiredString(row.steps, '[]'),
    expectedResult: optionalString(row.expectedResult),
    status: requiredString(row.status, 'active'),
    priority: requiredString(row.priority, 'medium'),
    tags: optionalString(row.tags),
    script: optionalString(row.script),
    createdAt: requiredDate(row.createdAt),
    updatedAt: requiredDate(row.updatedAt || row.createdAt),
  };
}

function mapTestRun(row) {
  return {
    id: requiredString(row.id, cryptoRandomId()),
    testCaseId: requiredString(row.testCaseId, ''),
    status: requiredString(row.status, 'pending'),
    duration: row.duration === undefined || row.duration === null ? null : Number(row.duration),
    logs: optionalString(row.logs),
    screenshot: optionalString(row.screenshot),
    error: optionalString(row.error),
    startedAt: requiredDate(row.startedAt),
    finishedAt: optionalDate(row.finishedAt),
  };
}

function mapBug(row) {
  return {
    id: requiredString(row.id, cryptoRandomId()),
    testCaseId: requiredString(row.testCaseId, ''),
    testRunId: requiredString(row.testRunId, ''),
    title: requiredString(row.title, 'Imported bug'),
    description: optionalString(row.description),
    severity: requiredString(row.severity, 'medium'),
    status: requiredString(row.status, 'open'),
    notes: optionalString(row.notes),
    createdAt: requiredDate(row.createdAt),
    updatedAt: requiredDate(row.updatedAt || row.createdAt),
  };
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

async function clearPostgresData() {
  await prisma.$transaction([
    prisma.bug.deleteMany(),
    prisma.testRun.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.testCase.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function upsertRows(model, rows) {
  for (const row of rows) {
    const { id, ...data } = row;
    await model.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
}

async function main() {
  assertSetup();
  prisma = new PrismaClient();

  console.log('SQLite source:', sqlitePath);
  console.log('PostgreSQL target:', maskDatabaseUrl(databaseUrl));

  const users = readSqliteTable('User').map(mapUser);
  const testCases = readSqliteTable('TestCase').map(mapTestCase);
  const apiKeys = readSqliteTable('ApiKey').map(mapApiKey);
  const testRuns = readSqliteTable('TestRun').map(mapTestRun);
  const bugs = readSqliteTable('Bug').map(mapBug);

  console.log('\nRows found in SQLite:');
  console.table({
    User: users.length,
    TestCase: testCases.length,
    ApiKey: apiKeys.length,
    TestRun: testRuns.length,
    Bug: bugs.length,
  });

  if (dryRun) {
    console.log('\nDry run complete. No PostgreSQL data was changed.');
    return;
  }

  if (clearTarget) {
    console.log('\nClearing PostgreSQL tables before import...');
    await clearPostgresData();
  }

  console.log('\nImporting rows into PostgreSQL...');
  await upsertRows(prisma.user, users);
  await upsertRows(prisma.testCase, testCases);
  await upsertRows(prisma.apiKey, apiKeys);
  await upsertRows(prisma.testRun, testRuns);
  await upsertRows(prisma.bug, bugs);

  console.log('\nImport complete:');
  console.table({
    User: users.length,
    TestCase: testCases.length,
    ApiKey: apiKeys.length,
    TestRun: testRuns.length,
    Bug: bugs.length,
  });
}

main()
  .catch((error) => {
    console.error('\nSQLite to PostgreSQL seed failed:');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
