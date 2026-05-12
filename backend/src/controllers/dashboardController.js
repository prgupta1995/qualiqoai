const prisma = require('../utils/prisma');

function normalizeRunStatus(status) {
  const normalizedStatus = String(status || '').toLowerCase();

  if (['pass', 'passed'].includes(normalizedStatus)) {
    return 'passed';
  }

  if (['fail', 'failed', 'error'].includes(normalizedStatus)) {
    return 'failed';
  }

  return normalizedStatus || 'unknown';
}

async function getSummary(_req, res, next) {
  try {
    const [totalTestCases, totalRuns, runs] = await Promise.all([
      prisma.testCase.count(),
      prisma.testRun.count(),
      prisma.testRun.findMany({
        select: { status: true },
      }),
    ]);

    const passedRuns = runs.filter((run) => normalizeRunStatus(run.status) === 'passed').length;
    const failedRuns = runs.filter((run) => normalizeRunStatus(run.status) === 'failed').length;
    const successRate = totalRuns ? Math.round((passedRuns / totalRuns) * 100) : 0;

    res.json({
      totalTestCases,
      totalRuns,
      passedRuns,
      failedRuns,
      successRate,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };
