const prisma          = require('../utils/prisma');
const { runScript }   = require('../runner/playwrightRunner');

/**
 * Orchestrates a full test execution:
 *  1. Fetch test case + its Playwright script
 *  2. Create a "running" TestRun record
 *  3. Execute the script
 *  4. Update the TestRun with results
 *  5. Auto-create a Bug record if the run failed
 *
 * @param {string} testCaseId
 * @returns {Promise<import('@prisma/client').TestRun>}
 */
async function executeTest(testCaseId) {
  // 1. Fetch test case
  const testCase = await prisma.testCase.findUniqueOrThrow({
    where: { id: testCaseId },
  });

  const script = String(testCase.script || '').trim();

  if (!script) {
    const error = new Error('Generated script is required before running automation');
    error.status = 400;
    throw error;
  }

  // 2. Create a pending run record
  const testRun = await prisma.testRun.create({
    data: {
      testCaseId,
      status: 'running',
    },
  });

  // 3. Execute
  let result;
  try {
    result = await runScript(script, testRun.id);
  } catch (fatalErr) {
    // Runner itself crashed
    result = {
      passed:         false,
      status:         'fail',
      logs:           [`[FATAL] Runner crashed: ${fatalErr.message}`],
      duration:       0,
      screenshot:     null,
      screenshotPath: null,
      error:          fatalErr.message,
    };
  }

  // 4. Persist results
  const finalStatus = result.passed ? 'passed' : 'failed';

  const updatedRun = await prisma.testRun.update({
    where: { id: testRun.id },
    data: {
      status:     finalStatus,
      duration:   result.duration,
      logs:       JSON.stringify(result.logs || []),
      screenshot: result.screenshot || null,
      error:      result.error,
      finishedAt: new Date(),
    },
    include: { testCase: true },
  });

  // 5. Auto-create bug on failure
  if (!result.passed) {
    await prisma.bug.create({
      data: {
        testCaseId,
        testRunId:   testRun.id,
        title:       `[Auto] Failure in "${testCase.title}"`,
        description: result.error
          ? `Error: ${result.error}`
          : 'Test script completed with assertions failing.',
        severity: testCase.priority === 'critical' ? 'critical' : 'high',
        status:   'open',
      },
    });
  }

  return updatedRun;
}

module.exports = { executeTest };
