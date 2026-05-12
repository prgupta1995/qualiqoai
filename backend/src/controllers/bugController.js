const prisma = require('../utils/prisma');
const { serializeTestRun } = require('../utils/serializeTestRun');

// ── GET /api/bugs ─────────────────────────────────────────────────────────────
async function listBugs(req, res, next) {
  try {
    const { status, severity, testCaseId } = req.query;

    const where = {};
    if (status)     where.status     = status;
    if (severity)   where.severity   = severity;
    if (testCaseId) where.testCaseId = testCaseId;

    const bugs = await prisma.bug.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        testCase: { select: { id: true, title: true } },
        testRun:  { select: { id: true, status: true, startedAt: true, screenshot: true, error: true } },
      },
    });

    res.json({
      data: bugs.map((bug) => ({
        ...bug,
        testRun: bug.testRun ? serializeTestRun(bug.testRun, req) : null,
      })),
      total: bugs.length,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/bugs/:id ─────────────────────────────────────────────────────────
async function getBug(req, res, next) {
  try {
    const bug = await prisma.bug.findUniqueOrThrow({
      where:   { id: req.params.id },
      include: { testCase: true, testRun: true },
    });
    res.json({
      ...bug,
      testRun: bug.testRun ? serializeTestRun(bug.testRun, req) : null,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/bugs ────────────────────────────────────────────────────────────
// Manual bug creation (auto-creation happens in testRunService on failure)
async function createBug(req, res, next) {
  try {
    const { testCaseId, testRunId, title, description, severity, notes } = req.body;

    if (!testCaseId || !testRunId || !title) {
      return res.status(400).json({ error: '`testCaseId`, `testRunId`, and `title` are required' });
    }

    const bug = await prisma.bug.create({
      data: {
        testCaseId,
        testRunId,
        title,
        description: description || null,
        severity:    severity    || 'medium',
        notes:       notes       || null,
      },
    });

    res.status(201).json(bug);
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/bugs/:id ─────────────────────────────────────────────────────────
async function updateBug(req, res, next) {
  try {
    const { title, description, severity, status, notes } = req.body;

    const bug = await prisma.bug.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(severity    !== undefined && { severity }),
        ...(status      !== undefined && { status }),
        ...(notes       !== undefined && { notes }),
      },
    });

    res.json(bug);
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/bugs/:id ──────────────────────────────────────────────────────
async function deleteBug(req, res, next) {
  try {
    await prisma.bug.delete({ where: { id: req.params.id } });
    res.json({ message: 'Bug deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listBugs, getBug, createBug, updateBug, deleteBug };
