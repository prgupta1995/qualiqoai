const { spawnSync } = require('child_process');

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.PRISMA_DB_DATABASE_URL ||
  process.env.PRISMA_DB_POSTGRES_URL ||
  process.env.PRISMA_DB_PRISMA_DATABASE_URL;

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const prismaArgs = process.argv.slice(2);

if (!prismaArgs.length) {
  console.error('Usage: node scripts/prisma-command.js <prisma command>');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...prismaArgs], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status || 0);
