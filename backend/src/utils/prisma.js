const { PrismaClient } = require('@prisma/client');

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.PRISMA_DB_DATABASE_URL ||
  process.env.PRISMA_DB_POSTGRES_URL ||
  process.env.PRISMA_DB_PRISMA_DATABASE_URL;

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

module.exports = prisma;
