const prisma = require('../utils/prisma');
const { executeTest } = require('../services/testRunService');
const { serializeTestRun } = require('../utils/serializeTestRun');
const { inspectSelectors, scanPageSelectors } = require('../services/selectorInspector.service');
const {
  generateManualTestCases,
  refineTestCases,
  generateScriptFromRecording,
  generateTestCasesFromDocument,
  generatePlaywrightScript,
  validateGeneratedPlaywrightScript,
} = require('../services/ai.service');

async function generateScript(req, res, next) {
  try {
    const { testCaseId, url, steps, model: requestedModel } = req.body;

    if (!testCaseId) {
      return res.status(400).json({ message: '`testCaseId` is required' });
    }

    const testCase = await prisma.testCase.findUniqueOrThrow({
      where: { id: testCaseId },
    });

    const targetUrl = url || testCase.url || 'https://example.com';
    const testSteps = steps ? steps : testCase.steps ? JSON.parse(testCase.steps) : [];

    const { script, model } = await generatePlaywrightScript(testSteps, {
      title: testCase.title,
      preconditions: testCase.preconditions,
      url: targetUrl,
      expectedResult: testCase.expectedResult,
      model: requestedModel,
    });

    await prisma.testCase.update({
      where: { id: testCaseId },
      data: { script },
    });

    res.json({
      message: 'Script generated successfully',
      testCaseId,
      script,
      model,
    });
  } catch (err) {
    next(err);
  }
}

async function inspectElementSelectors(req, res, next) {
  try {
    const { url, element, elements } = req.body;
    const requestedElements = Array.isArray(elements)
      ? elements.map((item) => String(item || '').trim()).filter(Boolean)
      : [String(element || '').trim()].filter(Boolean);

    if (!String(url || '').trim()) {
      return res.status(400).json({ message: '`url` is required' });
    }

    if (!requestedElements.length) {
      const result = await scanPageSelectors({ url });
      return res.json(result);
    }

    const results = [];

    for (const requestedElement of requestedElements.slice(0, 10)) {
      results.push(await inspectSelectors({ url, element: requestedElement }));
    }

    res.json({
      url,
      selectors: results,
    });
  } catch (err) {
    next(err);
  }
}

async function inspectElementSelector(req, res, next) {
  try {
    const { url, element } = req.body;

    if (!String(url || '').trim()) {
      return res.status(400).json({ message: '`url` is required' });
    }

    if (!String(element || '').trim()) {
      return res.status(400).json({ message: '`element` is required' });
    }

    const result = await inspectSelectors({ url, element });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function mapTestCasesToScripts(req, res, next) {
  try {
    const {
      testCaseIds = [],
      autoRun = false,
      overwriteExisting = false,
      model: requestedModel,
    } = req.body;

    if (!Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return res.status(400).json({ message: '`testCaseIds` must be a non-empty array' });
    }

    const uniqueIds = [...new Set(testCaseIds.map((id) => String(id).trim()).filter(Boolean))];
    const testCases = await prisma.testCase.findMany({
      where: { id: { in: uniqueIds } },
      orderBy: { createdAt: 'asc' },
    });

    if (!testCases.length) {
      return res.status(404).json({ message: 'No matching test cases were found' });
    }

    const orderedTestCases = uniqueIds
      .map((id) => testCases.find((testCase) => testCase.id === id))
      .filter(Boolean);

    const scripts = [];

    for (const testCase of orderedTestCases) {
      if (testCase.script && !overwriteExisting) {
        scripts.push({
          testCaseId: testCase.id,
          title: testCase.title,
          status: 'skipped_existing',
          message: 'Script already exists. Confirm overwrite to regenerate it.',
          script: testCase.script,
        });
        continue;
      }

      try {
        const { script, model } = await generatePlaywrightScript(
          testCase.steps ? JSON.parse(testCase.steps) : [],
          {
            title: testCase.title,
            preconditions: testCase.preconditions,
            url: testCase.url || 'https://example.com',
            expectedResult: testCase.expectedResult,
            model: requestedModel,
          },
        );

        validateGeneratedPlaywrightScript(script);

        await prisma.testCase.update({
          where: { id: testCase.id },
          data: { script },
        });

        const mappedScript = {
          testCaseId: testCase.id,
          title: testCase.title,
          status: 'generated',
          script,
          model,
        };

        if (autoRun) {
          const run = await executeTest(testCase.id);
          mappedScript.run = serializeTestRun(run, req);
        }

        scripts.push(mappedScript);
      } catch (generationError) {
        scripts.push({
          testCaseId: testCase.id,
          title: testCase.title,
          status: 'error',
          message:
            generationError.response?.data?.message ||
            generationError.response?.data?.error ||
            generationError.message,
        });
      }
    }

    res.json({ scripts });
  } catch (err) {
    next(err);
  }
}

async function generateTestCases(req, res, next) {
  try {
    const { feature, model: requestedModel } = req.body;

    if (!feature) {
      return res.status(400).json({ message: '`feature` is required' });
    }

    const { testCases } = await generateManualTestCases(feature, {
      model: requestedModel,
    });

    res.json({ testCases });
  } catch (err) {
    next(err);
  }
}

async function generateTestCasesFromDoc(req, res, next) {
  try {
    const {
      content,
      type,
      count,
      coverageLevel,
      model: requestedModel,
    } = req.body;

    if (!String(content || '').trim()) {
      return res.status(400).json({ message: '`content` is required' });
    }

    const {
      summary,
      detectedFlows,
      testCases,
      model,
    } = await generateTestCasesFromDocument(content, {
      type,
      count,
      coverageLevel,
      model: requestedModel,
    });

    res.json({ summary, detectedFlows, testCases, model });
  } catch (err) {
    next(err);
  }
}

async function refineGeneratedTestCases(req, res, next) {
  try {
    const {
      content,
      testCases,
      mode,
      targetCount,
      instruction,
      model: requestedModel,
    } = req.body;

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return res.status(400).json({ message: '`testCases` must be a non-empty array' });
    }

    if (!['shrink', 'expand', 'remove_duplicates', 'feature_scope_only'].includes(mode)) {
      return res.status(400).json({
        message: '`mode` must be one of shrink, expand, remove_duplicates, feature_scope_only',
      });
    }

    const { summary, testCases: refinedTestCases, model } = await refineTestCases({
      content,
      testCases,
      mode,
      targetCount,
      instruction,
      model: requestedModel,
    });

    res.json({ summary, testCases: refinedTestCases, model });
  } catch (err) {
    next(err);
  }
}

async function generateScriptFromRecordingController(req, res, next) {
  try {
    const { title, startUrl, actions, model: requestedModel } = req.body;

    if (!String(title || '').trim()) {
      return res.status(400).json({ message: '`title` is required' });
    }

    if (!String(startUrl || '').trim()) {
      return res.status(400).json({ message: '`startUrl` is required' });
    }

    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ message: '`actions` must be a non-empty array' });
    }

    const { script, model } = await generateScriptFromRecording({
      title,
      startUrl,
      actions,
      model: requestedModel,
    });

    res.json({
      message: 'Script generated successfully',
      script,
      model,
    });
  } catch (err) {
    next(err);
  }
}

async function generateAndRun(req, res, next) {
  try {
    const { content, type, model: requestedModel } = req.body;

    if (!String(content || '').trim()) {
      return res.status(400).json({ message: '`content` is required' });
    }

    const { testCases, model } = await generateTestCasesFromDocument(content, {
      type,
      model: requestedModel,
    });

    const results = [];

    for (const generatedTestCase of testCases) {
      const createdTestCase = await prisma.testCase.create({
        data: {
          title: generatedTestCase.title,
          description: `AI-generated from ${type || 'document'} input.`,
          preconditions: generatedTestCase.preconditions || 'None',
          steps: JSON.stringify(generatedTestCase.steps || []),
          expectedResult: generatedTestCase.expectedResult,
          priority: String(generatedTestCase.priority || 'Medium').toLowerCase(),
        },
      });

      const generatedScript = await generatePlaywrightScript(generatedTestCase.steps || [], {
        title: generatedTestCase.title,
        preconditions: generatedTestCase.preconditions,
        expectedResult: generatedTestCase.expectedResult,
        url: createdTestCase.url || 'https://example.com',
        model: requestedModel,
      });

      await prisma.testCase.update({
        where: { id: createdTestCase.id },
        data: { script: generatedScript.script },
      });

      const run = await executeTest(createdTestCase.id);

      results.push({
        testCase: {
          ...createdTestCase,
          steps: generatedTestCase.steps || [],
          script: generatedScript.script,
        },
        script: generatedScript.script,
        model,
        run: serializeTestRun(run, req),
      });
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateScript,
  generateAndRun,
  inspectElementSelector,
  inspectElementSelectors,
  generateScriptFromRecordingController,
  generateTestCases,
  generateTestCasesFromDoc,
  mapTestCasesToScripts,
  refineGeneratedTestCases,
};
