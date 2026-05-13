if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.VERCEL) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { VALID_ARIA_ROLES } = require('../services/universalSelector.service');

const SCREENSHOTS_DIR = path.resolve(
  __dirname,
  'screenshots'
);
const SCREENSHOTS_ROUTE_PREFIX = '/screenshots';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Runs a generated Playwright test inside an isolated browser context.
 *
 * @param {string} script      - Playwright JS code to execute
 * @param {string} testRunId   - Used to name the failure screenshot
 * @returns {{
 *   status: 'pass'|'fail',
 *   passed: boolean,
 *   logs: string[],
 *   logsText: string,
 *   duration: number,
 *   screenshot: string|null,
 *   screenshotPath: string|null,
 *   error: string|null
 * }}
 */
async function runScript(script, testRunId) {
  const logs = [];
  const startedAt = Date.now();
  const normalizedScript = normalizeScript(script);
  let browser = null;
  let context = null;
  let page = null;
  let passed = false;
  let errorMsg = null;
  let errorStack = null;
  let screenshot = null;
  let screenshotPath = null;
  let suppressedNetworkFailures = 0;

  const log = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    logs.push(entry);
    console.log(entry);
  };

  try {
    validateScript(normalizedScript);
    log('Launching Chromium (headless)...');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();

    page.on('console', (msg) => {
      if (shouldLogBrowserConsole(msg)) {
        log(`[browser:${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => log(`[pageerror] ${err.message}`));
    page.on('requestfailed', (request) => {
      const failure = request.failure();

      if (shouldLogRequestFailure(request)) {
        log(
          `Network request failed: ${request.method()} ${request.url()}${failure ? ` - ${failure.errorText}` : ''}`,
        );
      } else {
        suppressedNetworkFailures += 1;
      }
    });

    log('Executing test script...');
    await executeScriptInSandbox(normalizedScript, { page, log, expect: createSandboxExpect });

    passed = true;
    log('✅ Script completed successfully');
    ({ publicPath: screenshot, absolutePath: screenshotPath } = await captureScreenshot({
      page,
      testRunId,
      status: 'pass',
      log,
    }));
  } catch (err) {
    passed = false;
    errorMsg = err.message;
    errorStack = err.stack || null;
    buildReadableFailureLines(err).forEach(log);

    try {
      if (page) {
        ({ publicPath: screenshot, absolutePath: screenshotPath } = await captureScreenshot({
          page,
          testRunId,
          status: 'fail',
          log,
        }));
      }
    } catch (ssErr) {
      log(`⚠️ Could not capture screenshot: ${ssErr.message}`);
    }
  } finally {
    if (context) {
      await context.close().catch((closeError) => {
        log(`⚠️ Failed to close browser context: ${closeError.message}`);
      });
    }

    if (browser) {
      await browser.close().catch((closeError) => {
        log(`⚠️ Failed to close browser: ${closeError.message}`);
      });
      log('Browser closed');
    }
  }

  const duration = Date.now() - startedAt;
  if (suppressedNetworkFailures > 0) {
    log(`Suppressed ${suppressedNetworkFailures} non-critical browser network failure(s).`);
  }
  log(`Duration: ${duration}ms`);

  return {
    status: passed ? 'pass' : 'fail',
    passed,
    logs,
    logsText: logs.join('\n'),
    duration,
    screenshot,
    screenshotPath,
    error: errorStack || errorMsg,
  };
}

function firstErrorLine(error) {
  return String(error?.message || error || '').split('\n')[0].trim();
}

function extractFailedSelector(text) {
  const normalizedText = String(text || '');
  const locatorMatch = normalizedText.match(/waiting for locator\((['"`])([\s\S]*?)\1\)/);
  const selectorLineMatch = normalizedText.match(/(?:Selector|selector):\s*([^\n]+)/i);
  const triedMatch = normalizedText.match(/Tried selectors:\s*([^\n]+)/i);

  return locatorMatch?.[2] || selectorLineMatch?.[1]?.trim() || triedMatch?.[1]?.trim() || '';
}

function inferLikelyCause(errorText) {
  const normalizedText = String(errorText || '');

  if (/Timeout .*waiting for locator|locator\.\w+:\s*Timeout/i.test(normalizedText)) {
    return 'The target element was not found, not visible, or not ready before the timeout.';
  }

  if (/toHaveText|toContainText|Assertion failed/i.test(normalizedText)) {
    return 'An assertion did not match the actual page state.';
  }

  if (/Page failed to load|status\(\).*toBe\(200\)|net::ERR/i.test(normalizedText)) {
    return 'The page or a required network request did not load successfully.';
  }

  if (/strict mode violation/i.test(normalizedText)) {
    return 'The selector matched multiple elements. Use a more specific selector.';
  }

  return 'Review the failed step, selector, page state, and screenshot.';
}

function buildReadableFailureLines(error) {
  const errorText = String(error?.stack || error?.message || error || '');
  const selector = extractFailedSelector(errorText);
  const timeout = errorText.match(/Timeout\s+(\d+)ms/i)?.[1];
  const action = errorText.match(/locator\.(\w+):\s*Timeout/i)?.[1] ||
    errorText.match(/locator\.(\w+):/i)?.[1] ||
    '';
  const lines = [
    'Test failed',
    `Reason: ${firstErrorLine(error) || 'Unknown error'}`,
    `Likely cause: ${inferLikelyCause(errorText)}`,
  ];

  if (action) {
    lines.push(`Failed action: ${action}`);
  }

  if (selector) {
    lines.push(`Failed selector: ${selector}`);
  }

  if (timeout) {
    lines.push(`Timeout: ${timeout}ms`);
  }

  lines.push('Next check: open the screenshot and verify the selector still matches the intended element.');

  return lines;
}

function shouldLogBrowserConsole(message) {
  const text = String(message.text() || '');

  if (message.type() === 'error') {
    return true;
  }

  return !/clevertap|google|analytics|description.*aria-describedby/i.test(text);
}

function shouldLogRequestFailure(request) {
  const url = request.url();
  const resourceType = request.resourceType();

  if (resourceType === 'document') {
    return true;
  }

  if (/google-analytics|googletagmanager|doubleclick|clevertap|region\.target_domain|ccm\/collect|\/metrics|c8n\.tradeling/i.test(url)) {
    return false;
  }

  if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
    return false;
  }

  return ['xhr', 'fetch', 'script'].includes(resourceType);
}

function buildScreenshotTarget(testRunId, status) {
  const safeRunId = String(testRunId || 'test-run').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `run_${safeRunId}_${Date.now()}_${status}.png`;

  return {
    fileName,
    absolutePath: path.join(SCREENSHOTS_DIR, fileName),
    publicPath: `${SCREENSHOTS_ROUTE_PREFIX}/${fileName}`,
  };
}

async function captureScreenshot({ page, testRunId, status, log }) {
  const screenshotTarget = buildScreenshotTarget(testRunId, status);
  await page.screenshot({ path: screenshotTarget.absolutePath, fullPage: true });
  log(`📸 Screenshot saved: ${screenshotTarget.absolutePath}`);
  return screenshotTarget;
}

function validateScript(script) {
  const normalizedScript = String(script || '').trim();

  if (!normalizedScript) {
    throw new Error('Generated script is empty');
  }

  if (/^\s*```/m.test(normalizedScript)) {
    throw new Error('Generated script must not contain markdown code fences');
  }

  if (!/test\s*\(/.test(normalizedScript)) {
    throw new Error('Generated script must include a test() block');
  }

  if (!/\bpage\./.test(normalizedScript)) {
    throw new Error('Generated script must include Playwright page usage');
  }

  if (/\b(import|export|require)\b/.test(normalizedScript)) {
    throw new Error('Generated script must not include import, export, or require statements');
  }

  if (/getByRole\(\s*['"](?:logo|image|input|text|icon)['"]/i.test(normalizedScript)) {
    throw new Error(
      'Invalid selector generated: getByRole("logo"), getByRole("image"), getByRole("input"), getByRole("text"), and getByRole("icon") are not valid role selectors. Use universal selector candidates instead.',
    );
  }

  return true;
}

function normalizeScript(script) {
  const sanitizedScript = String(script || '')
    .replace(/^```(?:javascript|js)?/i, '')
    .replace(/```$/i, '')
    .replace(/^import\s+\{[^}]*\b(test|expect)\b[^}]*\}\s+from\s+['"]@playwright\/test['"];?\s*/gm, '')
    .replace(/^const\s+\{[^}]*\b(test|expect)\b[^}]*\}\s*=\s*require\(['"]@playwright\/test['"]\);?\s*/gm, '')
    .trim();

  if (!sanitizedScript) {
    return sanitizedScript;
  }

  const executableScript = stripFunctionDeclaration(sanitizedScript, 'findElement').trim();

  if (/test\s*\(/.test(executableScript)) {
    return executableScript;
  }

  if (/\bpage\./.test(executableScript)) {
    return [
      "test('Recovered generated test', async ({ page }) => {",
      executableScript
        .split('\n')
        .map((line) => (line.trim() ? `  ${line}` : line))
        .join('\n'),
      '});',
    ].join('\n');
  }

  return executableScript;
}

function stripFunctionDeclaration(script, functionName) {
  let output = String(script || '');
  const functionPattern = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'g');
  let match = functionPattern.exec(output);

  while (match) {
    const start = match.index;
    const openingBraceIndex = output.indexOf('{', functionPattern.lastIndex);

    if (openingBraceIndex < 0) {
      break;
    }

    let depth = 0;
    let end = openingBraceIndex;

    for (; end < output.length; end += 1) {
      const char = output[end];

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;

        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }

    if (depth !== 0) {
      break;
    }

    output = `${output.slice(0, start)}${output.slice(end)}`;
    functionPattern.lastIndex = start;
    match = functionPattern.exec(output);
  }

  return output;
}

function createSandboxExpect(actual, message) {
  const fail = (matcher, expected) => {
    const suffix = expected === undefined ? '' : ` Expected: ${stringifyLogArg(expected)}.`;
    throw new Error(message || `Assertion failed: ${matcher}. Received: ${stringifyLogArg(actual)}.${suffix}`);
  };

  const assert = (condition, matcher, expected) => {
    if (!condition) {
      fail(matcher, expected);
    }
  };

  return {
    toBe(expected) {
      assert(Object.is(actual, expected), 'toBe', expected);
    },
    toEqual(expected) {
      assert(JSON.stringify(actual) === JSON.stringify(expected), 'toEqual', expected);
    },
    toBeTruthy() {
      assert(Boolean(actual), 'toBeTruthy');
    },
    toBeFalsy() {
      assert(!actual, 'toBeFalsy');
    },
    toBeDefined() {
      assert(actual !== undefined, 'toBeDefined');
    },
    toBeNull() {
      assert(actual === null, 'toBeNull');
    },
    toContain(expected) {
      assert(String(actual).includes(String(expected)), 'toContain', expected);
    },
    toBeGreaterThan(expected) {
      assert(Number(actual) > Number(expected), 'toBeGreaterThan', expected);
    },
    toBeGreaterThanOrEqual(expected) {
      assert(Number(actual) >= Number(expected), 'toBeGreaterThanOrEqual', expected);
    },
    toBeLessThan(expected) {
      assert(Number(actual) < Number(expected), 'toBeLessThan', expected);
    },
    toBeLessThanOrEqual(expected) {
      assert(Number(actual) <= Number(expected), 'toBeLessThanOrEqual', expected);
    },
    async toBeVisible(options = {}) {
      await actual.waitFor({ state: 'visible', timeout: options.timeout || 5000 });
    },
    async toBeHidden(options = {}) {
      await actual.waitFor({ state: 'hidden', timeout: options.timeout || 5000 });
    },
    async toBeEnabled(options = {}) {
      await actual.waitFor({ state: 'visible', timeout: options.timeout || 5000 });
      assert(await actual.isEnabled(), 'toBeEnabled');
    },
    async toBeDisabled(options = {}) {
      await actual.waitFor({ state: 'visible', timeout: options.timeout || 5000 });
      assert(await actual.isDisabled(), 'toBeDisabled');
    },
    async toHaveText(expected, options = {}) {
      await actual.waitFor({ state: 'visible', timeout: options.timeout || 5000 });
      const text = await actual.textContent();
      assert(String(text || '').trim() === String(expected).trim(), 'toHaveText', expected);
    },
    async toContainText(expected, options = {}) {
      await actual.waitFor({ state: 'visible', timeout: options.timeout || 5000 });
      const text = await actual.textContent();
      assert(String(text || '').includes(String(expected)), 'toContainText', expected);
    },
    async toHaveAttribute(name, expected, options = {}) {
      await actual.waitFor({ state: 'attached', timeout: options.timeout || 5000 });
      const value = await actual.getAttribute(name);
      assert(value !== null, `toHaveAttribute(${name})`);

      if (expected !== undefined) {
        assert(value === expected, `toHaveAttribute(${name})`, expected);
      }
    },
    async toHaveURL(expected, options = {}) {
      const timeout = options.timeout || 5000;
      const startedAt = Date.now();

      while (Date.now() - startedAt <= timeout) {
        const currentUrl = typeof actual.url === 'function' ? actual.url() : String(actual || '');
        const matches = expected instanceof RegExp
          ? expected.test(currentUrl)
          : String(currentUrl).includes(String(expected));

        if (matches) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const currentUrl = typeof actual.url === 'function' ? actual.url() : String(actual || '');
      fail('toHaveURL', expected instanceof RegExp ? expected.toString() : expected || currentUrl);
    },
  };
}

async function executeScriptInSandbox(script, runtime) {
  let registeredTest = null;

  const test = (title, fn) => {
    if (typeof title !== 'string' || typeof fn !== 'function') {
      throw new Error('Generated script must register test(title, async ({ page }) => { ... })');
    }

    if (registeredTest) {
      throw new Error('Generated script must define exactly one test() block');
    }

    registeredTest = { title, fn };
  };

  const sandbox = {
    test,
    expect: runtime.expect,
    findElement: createFindElement(runtime),
    console: {
      log: (...args) => runtime.log(args.map(stringifyLogArg).join(' ')),
      error: (...args) => runtime.log(`[console.error] ${args.map(stringifyLogArg).join(' ')}`),
      warn: (...args) => runtime.log(`[console.warn] ${args.map(stringifyLogArg).join(' ')}`),
    },
    process,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  vm.createContext(sandbox);
  const wrappedScript = `(async () => { ${script}\n })();`;
  const compiledScript = new vm.Script(wrappedScript, {
    filename: 'generated-playwright-script.js',
  });

  await compiledScript.runInContext(sandbox, { timeout: 30000 });

  if (!registeredTest) {
    throw new Error('Generated script did not register a runnable test() block');
  }

  runtime.log(`Running test: ${registeredTest.title}`);
  await registeredTest.fn({ page: runtime.page });
}

function createFindElement(runtime) {
  return async function findElement(page, selectors, label = 'element') {
    const attemptedSelectors = [];
    let lastError = null;

    for (const selector of Array.isArray(selectors) ? selectors : []) {
      const descriptor = selector.type === 'role'
        ? `${selector.type}:${selector.role}:${selector.name || selector.value || ''}`
        : `${selector.type}:${selector.value || ''}`;
      attemptedSelectors.push(descriptor);

      try {
        let locator;

        if (selector.type === 'testid') {
          locator = page.getByTestId(selector.value);
        } else if (selector.type === 'role') {
          if (!VALID_ARIA_ROLES.has(String(selector.role || '').toLowerCase())) {
            throw new Error(`Invalid or unsupported ARIA role "${selector.role}"`);
          }

          locator = page.getByRole(selector.role, { name: selector.name || selector.value });
        } else if (selector.type === 'text') {
          locator = page.getByText(selector.value, { exact: false });
        } else if (selector.type === 'placeholder') {
          locator = page.getByPlaceholder(selector.value);
        } else if (selector.type === 'label') {
          locator = page.getByLabel(selector.value);
        } else {
          locator = page.locator(selector.value);
        }

        const count = await locator.count();
        runtime.log(`Selector attempt for ${label}: ${descriptor} (${count} match${count === 1 ? '' : 'es'})`);

        if (count > 0) {
          const first = locator.first();
          await first.waitFor({ state: 'visible', timeout: 3000 });
          return first;
        }
      } catch (error) {
        lastError = error;
        runtime.log(`Selector failed for ${label}: ${descriptor} - ${error.message}`);
      }
    }

    throw new Error(
      `${label} not found. Tried selectors: ${attemptedSelectors.filter(Boolean).join(', ')}${lastError ? `. Last error: ${lastError.message}` : ''}`,
    );
  };
}

function stringifyLogArg(value) {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

module.exports = { runScript };
