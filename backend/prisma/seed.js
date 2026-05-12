/**
 * prisma/seed.js
 * Run with:  node prisma/seed.js
 *            — or —
 *            npm run db:seed
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Testtoria.ai database...\n');

  // ── 1. Clear existing data (safe for dev) ────────────────────────────────
  await prisma.bug.deleteMany();
  await prisma.testRun.deleteMany();
  await prisma.testCase.deleteMany();

  // ── 2. Test cases ────────────────────────────────────────────────────────
  const tc1 = await prisma.testCase.create({
    data: {
      title:       'Homepage smoke test',
      description: 'Verify the homepage loads and has a valid title',
      url:         'https://example.com',
      steps:       JSON.stringify([
        'Navigate to homepage',
        'Verify page title is not empty',
        'Check page responds with 200',
      ]),
      priority: 'high',
      tags:     'smoke,homepage',
      script: `
log('Navigating to https://example.com');
await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
const title = await page.title();
log('Page title: ' + title);
expect(title.length > 0, 'Page title must not be empty');
log('✅ Homepage smoke test passed');
`.trim(),
    },
  });

  const tc2 = await prisma.testCase.create({
    data: {
      title:       'Login form validation',
      description: 'Ensure the login form shows an error on empty submit',
      url:         'https://the-internet.herokuapp.com/login',
      steps:       JSON.stringify([
        'Navigate to login page',
        'Click login without credentials',
        'Assert error message is visible',
      ]),
      priority: 'critical',
      tags:     'auth,regression',
      script: `
log('Navigating to login page');
await page.goto('https://the-internet.herokuapp.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.click('button[type="submit"]');
await page.waitForSelector('.flash.error', { timeout: 5000 });
const errorText = await page.textContent('.flash.error');
log('Error text: ' + errorText.trim());
expect(errorText.includes('Your username is invalid'), 'Expected login error message');
log('✅ Login validation test passed');
`.trim(),
    },
  });

  const tc3 = await prisma.testCase.create({
    data: {
      title:       'Search functionality check',
      description: 'Confirm search returns results on example query',
      url:         'https://example.com',
      steps:       JSON.stringify([
        'Navigate to site',
        'Verify search input exists (placeholder test)',
      ]),
      priority: 'medium',
      tags:     'search,ui',
      // No script yet — will be generated via /api/ai/generate-script
    },
  });

  console.log(`✅ Created test cases: ${tc1.id}, ${tc2.id}, ${tc3.id}`);

  // ── 3. Seed a historical test run (passed) ────────────────────────────────
  const run1 = await prisma.testRun.create({
    data: {
      testCaseId: tc1.id,
      status:     'passed',
      duration:   1342,
      logs:       JSON.stringify([
        '[2026-05-01T10:00:00.000Z] Launching Chromium (headless)...',
        '[2026-05-01T10:00:01.200Z] Navigating to https://example.com',
        '[2026-05-01T10:00:02.100Z] Page title: Example Domain',
        '[2026-05-01T10:00:02.101Z] ✅ Homepage smoke test passed',
        '[2026-05-01T10:00:02.342Z] Duration: 1342ms',
      ]),
      startedAt:  new Date('2026-05-01T10:00:00.000Z'),
      finishedAt: new Date('2026-05-01T10:00:01.342Z'),
    },
  });

  // ── 4. Seed a historical test run (failed) + auto-bug ────────────────────
  const run2 = await prisma.testRun.create({
    data: {
      testCaseId: tc2.id,
      status:     'failed',
      duration:   4200,
      error:      'Timeout waiting for .flash.error selector (site may be down)',
      logs:       JSON.stringify([
        '[2026-05-01T11:00:00.000Z] Launching Chromium (headless)...',
        '[2026-05-01T11:00:01.300Z] Navigating to https://the-internet.herokuapp.com/login',
        '[2026-05-01T11:00:04.200Z] ❌ Script failed: Timeout 5000ms exceeded',
        '[2026-05-01T11:00:04.200Z] Duration: 4200ms',
      ]),
      startedAt:  new Date('2026-05-01T11:00:00.000Z'),
      finishedAt: new Date('2026-05-01T11:00:04.200Z'),
    },
  });

  // Bug auto-created from the failed run
  const bug1 = await prisma.bug.create({
    data: {
      testCaseId:  tc2.id,
      testRunId:   run2.id,
      title:       '[Auto] Failure in "Login form validation"',
      description: 'Error: Timeout 5000ms exceeded waiting for .flash.error selector',
      severity:    'critical',
      status:      'open',
      notes:       'Heroku site may be sleeping — re-run during active hours',
    },
  });

  console.log(`✅ Created test runs: ${run1.id} (passed), ${run2.id} (failed)`);
  console.log(`✅ Created bug: ${bug1.id}\n`);
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
