const prisma              = require('../utils/prisma');
const { executeTest }     = require('../services/testRunService');
const { serializeTestRun } = require('../utils/serializeTestRun');

// ── POST /api/tests/:id/run ───────────────────────────────────────────────────
async function runTest(req, res, next) {
  try {
    const { id } = req.params;

    // Verify test case exists first
    await prisma.testCase.findUniqueOrThrow({ where: { id } });

    // Execute asynchronously but wait for result in this MVP
    const testRun = await executeTest(id);

    const serializedRun = serializeTestRun(testRun, req);

    res.json({
      message:    testRun.status === 'passed' ? '✅ Test passed' : '❌ Test failed',
      status:     serializedRun.status,
      logs:       serializedRun.logs,
      screenshot: serializedRun.screenshot,
      duration:   serializedRun.duration,
      testRun:    serializedRun,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/runs ─────────────────────────────────────────────────────────────
async function listRuns(req, res, next) {
  try {
    const { testCaseId, status, limit = '20', offset = '0' } = req.query;

    const where = {};
    if (testCaseId) where.testCaseId = testCaseId;
    if (status)     where.status     = status;

    const [runs, total] = await Promise.all([
      prisma.testRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take:    parseInt(limit, 10),
        skip:    parseInt(offset, 10),
        include: { testCase: { select: { id: true, title: true } }, bug: true },
      }),
      prisma.testRun.count({ where }),
    ]);

    res.json({
      data: runs.map((run) => serializeTestRun(run, req)),
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/runs/:id ─────────────────────────────────────────────────────────
async function getRun(req, res, next) {
  try {
    const run = await prisma.testRun.findUniqueOrThrow({
      where:   { id: req.params.id },
      include: { testCase: true, bug: true },
    });

    // Parse logs JSON string back to array for convenience
    res.json(serializeTestRun(run, req));
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/runs/:id ──────────────────────────────────────────────────────
async function deleteRun(req, res, next) {
  try {
    await prisma.testRun.delete({ where: { id: req.params.id } });
    res.json({ message: 'Run deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { runTest, listRuns, getRun, deleteRun };
