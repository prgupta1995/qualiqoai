const prisma = require('../utils/prisma');

function normalizeStepForStorage(step) {
  if (typeof step === 'string') {
    return step.trim();
  }

  if (step && typeof step === 'object') {
    const action = String(step.action || step.description || step.text || step.type || '').trim();
    const expectedResult = String(step.expectedResult || step.expected || '').trim();
    const selector = String(step.selector || step.selectorFinderSelector || '').trim();
    const selectorSource = ['selector-finder', 'manual', 'ai'].includes(step.selectorSource)
      ? step.selectorSource
      : selector
        ? 'manual'
        : '';

    return {
      ...step,
      ...(action && { action }),
      ...(expectedResult && { expectedResult }),
      ...(selector && { selector }),
      ...(selector && { selectorFinderSelector: selector }),
      ...(selectorSource && { selectorSource }),
    };
  }

  return String(step || '').trim();
}

function isUsableStep(step) {
  if (typeof step === 'string') {
    return Boolean(step.trim());
  }

  if (step && typeof step === 'object') {
    return Boolean(
      String(step.action || step.description || step.text || step.type || step.selector || step.selectorFinderSelector || '').trim(),
    );
  }

  return Boolean(String(step || '').trim());
}

function normalizeStepsForStorage(steps) {
  return (Array.isArray(steps) ? steps : [])
    .map(normalizeStepForStorage)
    .filter(isUsableStep);
}

// ── GET /api/tests ────────────────────────────────────────────────────────────
async function listTestCases(req, res, next) {
  try {
    const { status, priority, search } = req.query;

    const where = {};
    if (status)   where.status   = status;
    if (priority) where.priority = priority;
    if (search)   where.title    = { contains: search };

    const testCases = await prisma.testCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { testRuns: true, bugs: true } },
      },
    });

    res.json({ data: testCases, total: testCases.length });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/tests/:id ────────────────────────────────────────────────────────
async function getTestCase(req, res, next) {
  try {
    const testCase = await prisma.testCase.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        testRuns: { orderBy: { startedAt: 'desc' }, take: 10 },
        bugs:     { orderBy: { createdAt: 'desc' } },
      },
    });
    res.json(testCase);
  } catch (err) {
    next(err);
  }
}

// ── POST /api/tests ───────────────────────────────────────────────────────────
async function createTestCase(req, res, next) {
  try {
    const { title, description, preconditions, url, steps, priority, tags, script, expectedResult, type, module } = req.body;

    if (!title) {
      return res.status(400).json({ error: '`title` is required' });
    }

    const normalizedSteps = normalizeStepsForStorage(steps);

    const testCase = await prisma.testCase.create({
      data: {
        title,
        description: description || null,
        preconditions: preconditions || null,
        url:         url         || null,
        steps:       JSON.stringify(normalizedSteps),
        expectedResult: expectedResult || null,
        priority:    priority    || 'medium',
        tags:        tags || [type && `type:${type}`, module && `module:${module}`].filter(Boolean).join(',') || null,
        script:      script      || null,
      },
    });

    res.status(201).json(testCase);
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/tests/:id ────────────────────────────────────────────────────────
async function updateTestCase(req, res, next) {
  try {
    const {
      title,
      description,
      preconditions,
      url,
      steps,
      status,
      priority,
      tags,
      script,
      generated_script: generatedScript,
      expectedResult,
      type,
      module,
    } = req.body;

    const existingTestCase = await prisma.testCase.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, steps: true },
    });

    if (!existingTestCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    if (title !== undefined && !String(title || '').trim()) {
      return res.status(400).json({ error: '`title` is required' });
    }

    const normalizedSteps = steps !== undefined ? normalizeStepsForStorage(steps) : null;

    if (steps !== undefined && (!Array.isArray(steps) || normalizedSteps.length === 0)) {
      return res.status(400).json({ error: '`steps` must be a non-empty array' });
    }

    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description }),
        ...(preconditions !== undefined && { preconditions }),
        ...(url         !== undefined && { url }),
        ...(steps       !== undefined && { steps: JSON.stringify(normalizedSteps) }),
        ...(expectedResult !== undefined && { expectedResult }),
        ...(status      !== undefined && { status }),
        ...(priority    !== undefined && { priority }),
        ...(tags        !== undefined && { tags }),
        ...((tags === undefined && (type !== undefined || module !== undefined)) && {
          tags: [type && `type:${type}`, module && `module:${module}`].filter(Boolean).join(',') || null,
        }),
        ...((script      !== undefined || generatedScript !== undefined) && {
          script: generatedScript !== undefined ? generatedScript : script,
        }),
      },
    });

    res.json({ message: 'Test case updated successfully', testCase });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/tests/:id/script ──────────────────────────────────────────────
async function updateTestCaseScript(req, res, next) {
  try {
    const generatedScript = String(req.body?.generated_script || '').trim();

    if (!generatedScript) {
      return res.status(400).json({ error: '`generated_script` is required' });
    }

    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { script: generatedScript },
    });

    res.json({ message: 'Script updated successfully', testCase });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/tests/bulk-create ──────────────────────────────────────────────
async function bulkCreateTestCases(req, res, next) {
  try {
    const { testCases = [] } = req.body;

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return res.status(400).json({ error: '`testCases` must be a non-empty array' });
    }

    const sanitizedCases = testCases
      .filter((testCase) => testCase && testCase.title)
      .map((testCase) => ({
        title: testCase.title,
        description: testCase.description || null,
        preconditions: testCase.preconditions || null,
        url: testCase.url || null,
        steps: JSON.stringify(normalizeStepsForStorage(testCase.steps)),
        expectedResult: testCase.expectedResult || null,
        priority: testCase.priority || 'medium',
        tags: testCase.tags ||
          [testCase.type && `type:${testCase.type}`, testCase.module && `module:${testCase.module}`]
            .filter(Boolean)
            .join(',') ||
          null,
        script: testCase.script || null,
      }));

    if (!sanitizedCases.length) {
      return res.status(400).json({ error: 'At least one test case with a title is required' });
    }

    await prisma.testCase.createMany({
      data: sanitizedCases,
    });

    const createdTestCases = await prisma.testCase.findMany({
      orderBy: { createdAt: 'desc' },
      take: sanitizedCases.length,
    });

    res.status(201).json({
      message: 'Test cases created successfully',
      data: createdTestCases.reverse(),
      total: createdTestCases.length,
    });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/tests/:id ─────────────────────────────────────────────────────
async function deleteTestCase(req, res, next) {
  try {
    const testCase = await prisma.testCase.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    await prisma.$transaction([
      prisma.bug.deleteMany({ where: { testCaseId: req.params.id } }),
      prisma.testRun.deleteMany({ where: { testCaseId: req.params.id } }),
      prisma.testCase.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ message: 'Test case deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/tests/bulk-delete ─────────────────────────────────────────────
async function bulkDeleteTestCases(req, res, next) {
  try {
    const ids = [...new Set(
      (Array.isArray(req.body?.ids) ? req.body.ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )];

    if (!ids.length) {
      return res.status(400).json({ error: '`ids` must be a non-empty array' });
    }

    const matchingTestCases = await prisma.testCase.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const matchingIds = matchingTestCases.map((testCase) => testCase.id);

    if (!matchingIds.length) {
      return res.json({
        message: 'Test cases deleted successfully',
        deletedCount: 0,
      });
    }

    const [, , deletedTestCases] = await prisma.$transaction([
      prisma.bug.deleteMany({ where: { testCaseId: { in: matchingIds } } }),
      prisma.testRun.deleteMany({ where: { testCaseId: { in: matchingIds } } }),
      prisma.testCase.deleteMany({ where: { id: { in: matchingIds } } }),
    ]);

    res.json({
      message: 'Test cases deleted successfully',
      deletedCount: deletedTestCases.count,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/tests/:id/run ───────────────────────────────────────────────────
// Delegate to testRunController — this export is just a re-export convenience
const { runTest } = require('./testRunController');

module.exports = {
  listTestCases,
  getTestCase,
  createTestCase,
  bulkCreateTestCases,
  updateTestCase,
  updateTestCaseScript,
  deleteTestCase,
  bulkDeleteTestCases,
  runTest,
};
