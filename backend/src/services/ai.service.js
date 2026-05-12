const aiProvider = require('./ai/aiProvider.service');
const { inspectSelectors } = require('./selectorInspector.service');
const { buildUniversalSelectorCandidates } = require('./universalSelector.service');

const PLAYWRIGHT_SCRIPT_PROMPT = `You are a senior QA automation engineer generating a Playwright test in JavaScript.

Return ONLY valid JavaScript code.
Do not include markdown fences.
Do not include explanations.

Hard requirements:
- Include exactly this import at the top:
  import { test, expect } from '@playwright/test'
- Output a single Playwright test using test('...', async ({ page }) => { ... }).
- Do NOT include helper functions.
- Do NOT include selector arrays.
- Do NOT use findElement().
- For each element, create exactly one locator variable. Use page.locator('...') for unique selector hints, and use .first() only when a concise fallback selector list is genuinely required.
- Use concise comma-separated selectors inside page.locator(...) only when fallback selectors are truly useful.
- When generating selectors, choose the most reliable single selector. Prefer data-testid and Playwright getByTestId. If the target element is inside a stable parent like an anchor href, scope it using :has(). Avoid broad selector chains and avoid .first() when the selector is already unique.
- Use const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }) near the start.
- Validate HTTP status using:
  expect(response?.status()).toBe(200)
- Never infer response status from DOM content, viewport meta tags, document title, or page.evaluate().
- Use VERIFIED_SELECTOR_HINTS when provided. Prefer locatorSelector exactly as supplied for the matching element.
- If a test step includes selectorFinderSelector or selectorSource="selector-finder", use that selector exactly. Do not replace it with generic selector guesses.
- If no verified selector hint exists, choose one clean page.locator(...) selector expression using the selector priority below.
- For a simple homepage smoke test, keep the script short: navigate, verify HTTP status, and verify only requested meaningful elements.
- Selector priority must be exactly:
  1. data-testid / data-test / data-qa
  2. id
  3. name attribute
  4. placeholder
  5. aria-label
  6. href / alt / title attributes
  7. stable class names
  8. visible text
  9. XPath as last fallback
- Use getByRole only when role is clearly valid and stable. Valid examples: button, textbox, link, checkbox.
- NEVER generate invalid roles such as logo, image, input, text, icon, or guessed menuitem.
- If unsure, use page.locator().
- For logos/images, do NOT use getByRole('logo'). Prefer page.locator() with data-testid, alt, title, href, or stable class selectors.
- Do NOT generate broad selectors like [class*="logo"], img[alt*="logo" i], or [aria-label*="logo" i] when a data-testid or scoped selector exists.
- Do NOT generate long fallback chains such as '[aria-label="logo"], img[alt*="logo" i], [class*="logo" i]'.
- Avoid brittle selectors like nth-child, long CSS chains, random generated CSS classes, or hashed class names.
- Use clean Playwright assertions only:
  await expect(locator).toBeVisible()
  await expect(locator).toContainText('...')
  await expect(page).toHaveURL(...)
  expect(response?.status()).toBe(200)
- Do NOT use expect(await locator.isVisible()).toBe(true).
- Rely on Playwright auto-waiting. Do NOT use waitForTimeout().
- Handle login and form flows carefully with fill(), click(), check(), selectOption(), and navigation waits where appropriate.
- Do NOT add console logs unless specifically requested.
- Do not include placeholder comments such as "// Add more selectors here".
- If credentials are needed, reference process.env.E2E_USERNAME and process.env.E2E_PASSWORD.
- Keep the script production-ready and concise.

Expected locator style:
const loginButton = page.locator(
  '[data-testid="login-button"], #login-button, button[type="submit"]'
).first()

const logoLocator = page.locator('a[href="/ae-en"]:has([data-testid="tradeling-header-logo"])')

Good selector examples:
- page.getByTestId('tradeling-header-logo')
- page.locator('a[href="/ae-en"]:has([data-testid="tradeling-header-logo"])')
- page.locator('input[name="email"]')
- page.locator('a[href="/login"]')

Bad selector examples:
- page.locator('[aria-label="logo"], img[alt*="logo" i], [class*="logo" i], [aria-label*="logo" i]').first()
- page.getByRole('logo')
- page.locator('div > div > div > button:nth-child(2)')

The saved code may include the Playwright import. The Testtoria sandbox strips that import at runtime and provides test, expect, page, console, process, and timers.
Return code only.`;

const MANUAL_TEST_CASES_PROMPT = `You are a senior QA engineer generating manual test cases.

Return STRICTLY valid JSON with no markdown and no extra text.

Required JSON shape:
{
  "testCases": [
    {
      "title": "string",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "string"
    }
  ]
}

Rules:
- Generate 5 to 10 manual test cases.
- Cover happy path, edge cases, and negative scenarios.
- Keep titles concise and specific.
- Keep steps clear, actionable, and ordered.
- Keep expected results precise and testable.
- Do not include numbering outside the step text itself.
- Output JSON only.`;

const DOCUMENT_TEST_CASES_PROMPT = `You are a senior QA engineer generating high-quality manual test cases from requirements text.

You will receive content that may be a user story, acceptance criteria, product description, or functional document.

Your job:
1. Understand the content.
2. Infer user flows, business rules, validations, negative paths, and edge cases.
3. Generate non-duplicate manual test cases based on the requested count and coverage level.

Return STRICTLY valid JSON with no markdown and no extra text.

Required JSON shape:
{
  "summary": "Short summary of understood feature",
  "detectedFlows": ["Flow 1", "Flow 2"],
  "testCases": [
    {
      "title": "string",
      "preconditions": "string",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "string",
      "priority": "High",
      "type": "Positive",
      "module": "string"
    }
  ]
}

Rules:
- Coverage must include happy path, negative scenarios, validation rules, edge cases, boundary cases, and permission/access scenarios when relevant.
- Basic coverage: focus on core happy path and most important failures.
- Standard coverage: balance positive, negative, validation, and edge cases.
- Detailed coverage: include deeper boundary, permission, state transition, and recovery cases.
- Keep titles specific and concise.
- Keep preconditions brief and relevant. Use "None" if there are no special preconditions.
- Keep steps detailed, clear, actionable, and ordered.
- Keep expected results precise and testable.
- Priority must be exactly one of: High, Medium, Low.
- Type must be exactly one of: Positive, Negative, Edge, Validation.
- Module must be a concise product area inferred from the source content.
- Avoid generic vague cases and avoid duplicates or overlapping cases.
- Output JSON only.`;

const REFINE_TEST_CASES_PROMPT = `You are a senior QA engineer refining a draft set of manual test cases.

Return STRICTLY valid JSON with no markdown and no extra text.

Required JSON shape:
{
  "summary": "What was changed",
  "testCases": [
    {
      "title": "string",
      "preconditions": "string",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "string",
      "priority": "High",
      "type": "Positive",
      "module": "string"
    }
  ]
}

Mode rules:
- shrink: reduce test cases to the requested target count, keeping high-risk and high-value scenarios.
- expand: add missing relevant scenarios, especially edge, validation, negative, and permission/access cases. Return the complete improved list.
- remove_duplicates: remove repeated or overlapping cases while preserving meaningful coverage.
- feature_scope_only: remove cases not directly supported by the source feature/document.

Quality rules:
- Do not create unrelated cases.
- Preserve detailed actionable steps and clear expected results.
- Preserve priority, type, and module where accurate; fix them when they are missing or wrong.
- Avoid duplicates and vague generic test cases.
- Type must be exactly one of: Positive, Negative, Edge, Validation.
- Priority must be exactly one of: High, Medium, Low.
- Output JSON only.`;

const RECORDING_SCRIPT_PROMPT = `You are a senior QA automation engineer converting a manual action recording into a Playwright test in JavaScript.

Return ONLY valid JavaScript code.
Do not include markdown fences.
Do not include explanations.

Hard requirements:
- Include exactly this import at the top:
  import { test, expect } from '@playwright/test'
- Use test(title, async ({ page }) => { ... })
- Do NOT include helper functions.
- Do NOT include selector arrays.
- Do NOT use findElement().
- For each element, create exactly one locator variable. Use page.locator('...') for unique selector hints, and use .first() only when a concise fallback selector list is genuinely required.
- Start with const response = await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
- Validate response.status() with expect(response?.status()).toBe(200).
- Convert actions in the given order
- Build concise page.locator(...) selectors in this priority order: data-testid/data-test/data-qa, id, name, placeholder, aria-label, href/src/alt/title, stable class, visible text, XPath last.
- If an action includes selectorSource="selector-finder" or selectorFinderSelector, use that selector exactly.
- Use getByRole only when the ARIA role is valid, obvious, and cleaner than page.locator().
- NEVER generate getByRole('logo'), getByRole('image'), invalid role guesses, nth-child selectors, hashed classes, or deeply nested brittle CSS.
- Include clicks, fills, selects, submit actions, and manual validations based on the recording
- Include clean Playwright assertions such as await expect(locator).toBeVisible()
- Avoid nth-child selectors, long CSS chains, and brittle selectors
- Do not use waitForTimeout()
- Keep the script readable and production-friendly

Action mapping guidance:
- goto => await page.goto(url)
- click => const button = page.locator('selector').first(); await button.click()
- fill => const input = page.locator('selector').first(); await input.fill(value)
- select => const dropdown = page.locator('selector').first(); await dropdown.selectOption(value)
- submit => click a clean submit locator or press Enter when appropriate
- assert => await expect(locator).toBeVisible() or await expect(locator).toContainText(...)

Return code only.`;

function extractJsonBlock(text) {
  const normalizedText = String(text || '').trim();

  if (!normalizedText) {
    return '';
  }

  const firstBraceIndex = normalizedText.indexOf('{');
  const lastBraceIndex = normalizedText.lastIndexOf('}');

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return normalizedText.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return normalizedText;
}

function parseGeneratedTestCasesPayload(payload, invalidJsonMessage) {
  if (Array.isArray(payload)) {
    return { testCases: payload };
  }

  if (payload && typeof payload === 'object') {
    return payload;
  }

  const rawContent = extractJsonBlock(sanitizeGeneratedScript(payload));

  if (!rawContent) {
    return null;
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    throw new Error(invalidJsonMessage);
  }
}

function normalizeSteps(testSteps) {
  if (Array.isArray(testSteps)) {
    return testSteps
      .map((step, index) => {
        if (typeof step === 'string') {
          return `${index + 1}. ${step}`;
        }

        if (step && typeof step === 'object') {
          const lines = [`${index + 1}. ${step.description || step.action || step.type || JSON.stringify(step)}`];
          const selector = String(step.selectorFinderSelector || step.selector || '').trim();
          const selectorSource = String(step.selectorSource || '').trim();

          if (step.action && step.description) {
            lines.push(`   Action: ${step.action}`);
          }

          if (step.value) {
            lines.push(`   Action value: ${step.value}`);
          }

          if (step.assertion && step.assertion !== 'none') {
            lines.push(`   Assertion: ${step.assertion}`);
          }

          if (step.attributeName) {
            lines.push(`   Attribute name: ${step.attributeName}`);
          }

          if (step.expectedValue) {
            lines.push(`   Expected value: ${step.expectedValue}`);
          }

          if (step.expectedResult) {
            lines.push(`   Expected: ${step.expectedResult}`);
          }

          if (selector) {
            lines.push(`   Selector hint: ${selector}`);
            lines.push(`   Selector source: ${selectorSource || 'manual'}`);
            lines.push('   Use this selector exactly if it matches the described element.');
          }

          return lines.join('\n');
        }

        return `${index + 1}. ${String(step)}`;
      })
      .join('\n');
  }

  return String(testSteps || '').trim();
}

function buildUserPrompt(testSteps, options = {}) {
  const lines = [];

  if (options.title) {
    lines.push(`Test title: ${options.title}`);
  }

  if (options.preconditions) {
    lines.push(`Preconditions: ${options.preconditions}`);
  }

  if (options.url) {
    lines.push(`Base URL to visit: ${options.url}`);
  }

  lines.push('Test steps:');
  lines.push(normalizeSteps(testSteps) || '1. Open the page and verify it loads correctly.');

  if (options.expectedResult) {
    lines.push(`Expected result: ${options.expectedResult}`);
  }

  return lines.join('\n');
}

function extractStepSelectorHints(testSteps) {
  return (Array.isArray(testSteps) ? testSteps : [])
    .map((step, index) => {
      if (!step || typeof step !== 'object') {
        return null;
      }

      const selector = String(step.selectorFinderSelector || step.selector || '').trim();

      if (!selector) {
        return null;
      }

      return {
        stepNumber: index + 1,
        action: String(step.action || step.description || step.type || `Step ${index + 1}`).trim(),
        selector,
        selectorSource: step.selectorSource || (step.selectorFinderSelector ? 'selector-finder' : 'manual'),
      };
    })
    .filter(Boolean);
}

function extractSelectorPurposes(text) {
  const normalizedText = String(text || '').toLowerCase();
  const purposes = [];

  if (/\blogo\b|brand/.test(normalizedText)) purposes.push('Homepage Logo');
  if (/\bsearch\b|search bar|search input/.test(normalizedText)) purposes.push('Search Bar');
  if (/\blog\s*in\b|\blogin\b|sign\s*in/.test(normalizedText)) purposes.push('Login Button');
  if (/\bcart\b|basket|bag/.test(normalizedText)) purposes.push('Cart Icon');
  if (/\bmenu\b|hamburger|navigation|categories/.test(normalizedText)) purposes.push('Main Menu');
  if (/\bfooter\b/.test(normalizedText)) purposes.push('Footer');
  if (/\bbanner\b|hero|header/.test(normalizedText)) purposes.push('Banner');

  return [...new Set(purposes)];
}

function inferUniversalSelectorIntent(element) {
  const normalized = String(element || '').toLowerCase();

  if (normalized.includes('logo') || normalized.includes('brand')) {
    return { elementType: 'logo', label: 'logo', alt: 'logo' };
  }

  if (normalized.includes('search')) {
    return {
      elementType: 'input',
      label: 'Search',
      name: 'search',
      placeholder: 'Search',
      testId: 'search',
      inputType: 'search',
    };
  }

  if (normalized.includes('login') || normalized.includes('log in') || normalized.includes('sign in')) {
    return {
      elementType: normalized.includes('link') ? 'link' : 'button',
      label: 'Login',
      href: 'login',
      testId: 'login',
    };
  }

  if (normalized.includes('cart') || normalized.includes('basket') || normalized.includes('bag')) {
    return {
      elementType: 'link',
      label: 'Cart',
      href: 'cart',
      testId: 'cart',
    };
  }

  if (normalized.includes('menu') || normalized.includes('navigation') || normalized.includes('categories')) {
    return {
      elementType: 'button',
      label: 'Menu',
      testId: 'menu',
    };
  }

  if (normalized.includes('footer')) {
    return {
      elementType: 'text',
      label: 'Footer',
    };
  }

  if (normalized.includes('banner') || normalized.includes('header')) {
    return {
      elementType: 'text',
      label: normalized.includes('banner') ? 'Banner' : 'Header',
    };
  }

  return {
    elementType: 'text',
    label: element,
  };
}

function quoteCssSelectorValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function locatorPartFromCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return '';
  }

  const value = String(candidate.value || '').trim();

  if (!value) {
    return '';
  }

  if (candidate.type === 'testid') {
    return `[data-testid='${quoteCssSelectorValue(value)}']`;
  }

  if (candidate.type === 'placeholder') {
    return `input[placeholder='${quoteCssSelectorValue(value)}'], textarea[placeholder='${quoteCssSelectorValue(value)}']`;
  }

  if (candidate.type === 'label') {
    return '';
  }

  if (candidate.type === 'role') {
    return '';
  }

  if (candidate.type === 'text') {
    return '';
  }

  if (candidate.type === 'xpath') {
    return value.startsWith('//') || value.startsWith('xpath=') ? value : '';
  }

  if (candidate.type === 'css') {
    return value;
  }

  return '';
}

function buildCleanLocatorSelector(candidates) {
  const cssParts = [];
  const xpathParts = [];
  const seen = new Set();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const locatorPart = locatorPartFromCandidate(candidate);

    if (!locatorPart) {
      continue;
    }

    if (locatorPart.startsWith('//') || locatorPart.startsWith('xpath=')) {
      if (!seen.has(`xpath:${locatorPart}`)) {
        xpathParts.push(locatorPart);
        seen.add(`xpath:${locatorPart}`);
      }
      continue;
    }

    for (const part of locatorPart.split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!seen.has(`css:${part}`)) {
        cssParts.push(part);
        seen.add(`css:${part}`);
      }
    }
  }

  if (cssParts.length) {
    return cssParts.slice(0, 4).join(', ');
  }

  return xpathParts[0] || '';
}

async function buildVerifiedSelectorHints(url, prompt) {
  const normalizedUrl = String(url || '').trim();

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return [];
  }

  const purposes = extractSelectorPurposes(prompt);

  if (!purposes.length) {
    return [];
  }

  const hints = [];

  for (const element of purposes.slice(0, 6)) {
    try {
      const result = await inspectSelectors({ url: normalizedUrl, element });
      const genericFallbacks = buildUniversalSelectorCandidates(inferUniversalSelectorIntent(element));
      const locatorSelector = buildCleanLocatorSelector([
        ...(result.selectorFallbacks || []),
        ...genericFallbacks,
      ]);
      hints.push({
        element: result.element,
        locatorSelector,
        primarySelector: result.primarySelector || '',
        reason: result.reason || '',
      });
    } catch {
      const genericFallbacks = buildUniversalSelectorCandidates(inferUniversalSelectorIntent(element));
      hints.push({
        element,
        locatorSelector: buildCleanLocatorSelector(genericFallbacks),
        primarySelector: '',
        reason: 'Selector inspection failed for this element. Use locatorSelector if it is suitable, otherwise choose one clean locator manually.',
      });
    }
  }

  return hints;
}

function formatSelectorHints(selectorHints) {
  if (!selectorHints.length) {
    return '';
  }

  return [
    'VERIFIED_SELECTOR_HINTS:',
    JSON.stringify(selectorHints, null, 2),
    'For matching named elements, use locatorSelector inside page.locator(locatorSelector).first(). Do not create selector arrays or helper functions.',
  ].join('\n');
}

function formatStepSelectorHints(stepSelectorHints) {
  if (!stepSelectorHints.length) {
    return '';
  }

  return [
    'STEP_SELECTOR_HINTS:',
    JSON.stringify(stepSelectorHints, null, 2),
    'Use selector values from STEP_SELECTOR_HINTS exactly for their matching steps. These selectors came from Selector Finder or manual QA input and are more reliable than generic AI guesses.',
  ].join('\n');
}

function sanitizeGeneratedScript(script) {
  return String(script || '')
    .replace(/^```(?:javascript|js)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function ensurePlaywrightImport(script) {
  const trimmedScript = String(script || '').trim();

  if (!trimmedScript) {
    return trimmedScript;
  }

  if (/import\s+\{\s*test\s*,\s*expect\s*\}\s+from\s+['"]@playwright\/test['"]/.test(trimmedScript)) {
    return trimmedScript;
  }

  return `import { test, expect } from '@playwright/test'\n\n${trimmedScript}`;
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

  return output.trim();
}

function normalizeSelectorTypeLabels(script) {
  return String(script || '')
    .replace(
      /type\s*:\s*(['"])css\s+(?:id|data-testid|data-test-id|class|href|name|selector|aria-label)\1/gi,
      "type: 'css'",
    )
    .replace(/type\s*:\s*(['"])test-id\1/gi, "type: 'testid'");
}

function normalizePlaywrightScript(script) {
  const sanitizedScript = sanitizeGeneratedScript(script)
    .replace(/^import\s+\{[^}]*\b(test|expect)\b[^}]*\}\s+from\s+['"]@playwright\/test['"];?\s*/gm, '')
    .replace(/^const\s+\{[^}]*\b(test|expect)\b[^}]*\}\s*=\s*require\(['"]@playwright\/test['"]\);?\s*/gm, '')
    .trim();
  let normalizedBody = normalizeSelectorTypeLabels(stripFunctionDeclaration(sanitizedScript, 'findElement'))
    .replace(/^\s*\/\/\s*Add more selectors here\.?\s*$/gmi, '')
    .trim();

  if (!normalizedBody) {
    return normalizedBody;
  }

  if (!/test\s*\(/.test(normalizedBody) && /\bpage\./.test(normalizedBody)) {
    normalizedBody = [
      "test('Generated Playwright test', async ({ page }) => {",
      normalizedBody
        .split('\n')
        .map((line) => (line.trim() ? `  ${line}` : line))
        .join('\n'),
      '});',
    ].join('\n');
  }

  return ensurePlaywrightImport(normalizedBody);
}

function validateGeneratedPlaywrightScript(script) {
  const normalizedScript = String(script || '').trim();

  if (!normalizedScript) {
    throw new Error('Generated script is empty');
  }

  if (!/test\s*\(/.test(normalizedScript)) {
    throw new Error('Generated script must include a test() block');
  }

  if (!/\bpage\./.test(normalizedScript)) {
    throw new Error('Generated script must include Playwright page usage');
  }

  if (/getByRole\(\s*['"](?:logo|image|input|text|icon)['"]/i.test(normalizedScript)) {
    throw new Error('Generated script used an invalid ARIA role selector. Regenerate using selector fallback arrays instead of getByRole("logo") or getByRole("image").');
  }

  if (/\bfindElement\s*\(/.test(normalizedScript)) {
    throw new Error('Generated script used findElement(). Regenerate using one page.locator(...).first() variable per element.');
  }

  if (/async\s+function\s+\w+|function\s+\w+\s*\(/.test(normalizedScript)) {
    throw new Error('Generated script included helper functions. Regenerate concise Playwright code without helpers.');
  }

  if (/meta\[name=["']viewport["']\][\s\S]*toBe\(\s*200\s*\)/i.test(normalizedScript)) {
    throw new Error('Generated script used DOM metadata as HTTP status. Use const response = await page.goto(url) and response.status() instead.');
  }

  if (/\[class\*=["']logo["'\s\]]|img\[alt\*=["']logo["'\s\]]|\[aria-label\*=["']logo["'\s\]]/i.test(normalizedScript)) {
    throw new Error('Generated script used a broad logo selector. Use a data-testid, scoped parent selector, href, alt, or title selector instead.');
  }

  return true;
}

const STRUCTURED_ACTIONS = new Set([
  'navigate',
  'click',
  'fill',
  'select',
  'hover',
  'check',
  'uncheck',
  'press',
  'uploadFile',
]);

const STRUCTURED_ASSERTIONS = new Set([
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isClickable',
  'hasText',
  'containsText',
  'hasValue',
  'hasURL',
  'hasTitle',
  'hasAttribute',
  'hasCount',
]);
const STRUCTURED_SELECTOR_ACTIONS = new Set(['click', 'fill', 'select', 'hover', 'check', 'uncheck', 'press', 'uploadFile']);
const STRUCTURED_VALUE_ACTIONS = new Set(['navigate', 'fill', 'select', 'press', 'uploadFile']);
const STRUCTURED_SELECTOR_ASSERTIONS = new Set([
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isClickable',
  'hasText',
  'containsText',
  'hasValue',
  'hasAttribute',
  'hasCount',
]);
const STRUCTURED_EXPECTED_VALUE_ASSERTIONS = new Set([
  'hasText',
  'containsText',
  'hasValue',
  'hasURL',
  'hasTitle',
  'hasAttribute',
  'hasCount',
]);

function jsLiteral(value) {
  return JSON.stringify(String(value || ''));
}

function testTitleLiteral(value) {
  return jsLiteral(String(value || 'Generated Playwright test').trim() || 'Generated Playwright test');
}

function hasStructuredAutomationStep(testSteps) {
  return (Array.isArray(testSteps) ? testSteps : []).some((step) => (
    step &&
    typeof step === 'object' &&
    (
      STRUCTURED_ACTIONS.has(String(step.action || '').trim()) ||
      STRUCTURED_ASSERTIONS.has(String(step.assertion || '').trim())
    )
  ));
}

function normalizeStructuredStep(step) {
  const action = String(step?.action || '').trim();
  const assertion = String(step?.assertion || 'none').trim();

  return {
    description: String(step?.description || step?.text || step?.action || '').trim(),
    action: STRUCTURED_ACTIONS.has(action) ? action : '',
    selector: String(step?.selectorFinderSelector || step?.selector || '').trim(),
    value: String(step?.value || step?.actionValue || '').trim(),
    assertion: STRUCTURED_ASSERTIONS.has(assertion) ? assertion : 'none',
    expectedValue: String(step?.expectedValue || step?.expectedResult || '').trim(),
    attributeName: String(step?.attributeName || step?.attribute || '').trim(),
  };
}

function locatorLine(index, selector) {
  return `  const step${index}Locator = page.locator(${jsLiteral(selector)})`;
}

function locatorRef(index, useFirst = true) {
  return `step${index}Locator${useFirst ? '.first()' : ''}`;
}

function buildStructuredActionLines(step, index) {
  const lines = [];

  if (!step.action) {
    return lines;
  }

  if (step.action === 'navigate') {
    lines.push(`  const response${index} = await page.goto(${jsLiteral(step.value)}, {`);
    lines.push("    waitUntil: 'domcontentloaded',");
    lines.push('    timeout: 30000');
    lines.push('  })');
    lines.push('');
    lines.push(`  expect(response${index}?.status()).toBe(200)`);
    return lines;
  }

  if (step.action === 'click') {
    lines.push(`  await ${locatorRef(index)}.click()`);
  } else if (step.action === 'fill') {
    lines.push(`  await ${locatorRef(index)}.fill(${jsLiteral(step.value)})`);
  } else if (step.action === 'select') {
    lines.push(`  await ${locatorRef(index)}.selectOption(${jsLiteral(step.value)})`);
  } else if (step.action === 'hover') {
    lines.push(`  await ${locatorRef(index)}.hover()`);
  } else if (step.action === 'check') {
    lines.push(`  await ${locatorRef(index)}.check()`);
  } else if (step.action === 'uncheck') {
    lines.push(`  await ${locatorRef(index)}.uncheck()`);
  } else if (step.action === 'press') {
    lines.push(`  await ${locatorRef(index)}.press(${jsLiteral(step.value)})`);
  } else if (step.action === 'uploadFile') {
    lines.push(`  await ${locatorRef(index)}.setInputFiles(${jsLiteral(step.value)})`);
  }

  return lines;
}

function buildStructuredAssertionLines(step, index) {
  if (!step.assertion || step.assertion === 'none') {
    return [];
  }

  if (step.assertion === 'hasURL') {
    return [`  await expect(page).toHaveURL(${jsLiteral(step.expectedValue)})`];
  }

  if (step.assertion === 'hasTitle') {
    return [`  await expect(page).toHaveTitle(${jsLiteral(step.expectedValue)})`];
  }

  if (step.assertion === 'isVisible') {
    return [`  await expect(${locatorRef(index)}).toBeVisible()`];
  }

  if (step.assertion === 'isHidden') {
    return [`  await expect(${locatorRef(index)}).toBeHidden()`];
  }

  if (step.assertion === 'isEnabled') {
    return [`  await expect(${locatorRef(index)}).toBeEnabled()`];
  }

  if (step.assertion === 'isDisabled') {
    return [`  await expect(${locatorRef(index)}).toBeDisabled()`];
  }

  if (step.assertion === 'isClickable') {
    return [
      `  await expect(${locatorRef(index)}).toBeVisible()`,
      `  await expect(${locatorRef(index)}).toBeEnabled()`,
    ];
  }

  if (step.assertion === 'hasText') {
    return [`  await expect(${locatorRef(index)}).toHaveText(${jsLiteral(step.expectedValue)})`];
  }

  if (step.assertion === 'containsText') {
    return [`  await expect(${locatorRef(index)}).toContainText(${jsLiteral(step.expectedValue)})`];
  }

  if (step.assertion === 'hasValue') {
    return [`  await expect(${locatorRef(index)}).toHaveValue(${jsLiteral(step.expectedValue)})`];
  }

  if (step.assertion === 'hasAttribute') {
    return [`  await expect(${locatorRef(index)}).toHaveAttribute(${jsLiteral(step.attributeName)}, ${jsLiteral(step.expectedValue)})`];
  }

  if (step.assertion === 'hasCount') {
    return [`  await expect(${locatorRef(index, false)}).toHaveCount(Number(${jsLiteral(step.expectedValue)}))`];
  }

  return [];
}

function generateStructuredPlaywrightScript(testSteps, options = {}) {
  const structuredSteps = (Array.isArray(testSteps) ? testSteps : [])
    .map(normalizeStructuredStep)
    .filter((step) => step.action || step.assertion !== 'none');

  structuredSteps.forEach((step, index) => {
    const label = `Step ${index + 1}`;

    if ((STRUCTURED_SELECTOR_ACTIONS.has(step.action) || STRUCTURED_SELECTOR_ASSERTIONS.has(step.assertion)) && !step.selector) {
      throw new Error(`${label}: selector is required for the selected action/assertion`);
    }

    if (STRUCTURED_VALUE_ACTIONS.has(step.action) && !step.value) {
      throw new Error(`${label}: action value is required`);
    }

    if (STRUCTURED_EXPECTED_VALUE_ASSERTIONS.has(step.assertion) && !step.expectedValue) {
      throw new Error(`${label}: assertion expected value is required`);
    }

    if (step.assertion === 'hasAttribute' && !step.attributeName) {
      throw new Error(`${label}: attribute name is required`);
    }
  });

  const hasNavigateStep = structuredSteps.some((step) => step.action === 'navigate');
  const lines = [
    "import { test, expect } from '@playwright/test'",
    '',
    `test(${testTitleLiteral(options.title)}, async ({ page }) => {`,
  ];

  if (!hasNavigateStep && options.url) {
    lines.push(`  const response = await page.goto(${jsLiteral(options.url)}, {`);
    lines.push("    waitUntil: 'domcontentloaded',");
    lines.push('    timeout: 30000');
    lines.push('  })');
    lines.push('');
    lines.push('  expect(response?.status()).toBe(200)');
    lines.push('');
  }

  structuredSteps.forEach((step, stepIndex) => {
    const index = stepIndex + 1;
    const needsLocator = Boolean(step.selector) && !['hasURL', 'hasTitle'].includes(step.assertion);

    if (needsLocator) {
      lines.push(locatorLine(index, step.selector));
    }

    const actionLines = buildStructuredActionLines(step, index);
    const assertionLines = buildStructuredAssertionLines(step, index);

    if (actionLines.length) {
      if (needsLocator && lines[lines.length - 1] !== locatorLine(index, step.selector)) {
        lines.push(locatorLine(index, step.selector));
      }
      lines.push(...actionLines);
    }

    if (assertionLines.length) {
      if (needsLocator && !lines.includes(locatorLine(index, step.selector))) {
        lines.push(locatorLine(index, step.selector));
      }
      if (actionLines.length) {
        lines.push('');
      }
      lines.push(...assertionLines);
    }

    if (stepIndex < structuredSteps.length - 1) {
      lines.push('');
    }
  });

  lines.push('})');

  const script = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  validateGeneratedPlaywrightScript(script);
  return script;
}

async function generatePlaywrightScript(testSteps, options = {}) {
  if (hasStructuredAutomationStep(testSteps)) {
    const script = generateStructuredPlaywrightScript(testSteps, options);

    return {
      script,
      model: 'structured-step-mapper',
      prompt: buildUserPrompt(testSteps, options),
    };
  }

  const prompt = buildUserPrompt(testSteps, options);
  const selectorHints = await buildVerifiedSelectorHints(options.url, prompt);
  const stepSelectorHints = extractStepSelectorHints(testSteps);
  const rawScript = await aiProvider.generatePlaywrightScript(
    [
      PLAYWRIGHT_SCRIPT_PROMPT,
      prompt,
      formatStepSelectorHints(stepSelectorHints),
      formatSelectorHints(selectorHints),
    ].filter(Boolean).join('\n\n'),
  );
  const script = normalizePlaywrightScript(rawScript);

  validateGeneratedPlaywrightScript(script);

  return {
    script,
    model:
      options.model ||
      (process.env.AI_PROVIDER === 'openai'
        ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
        : process.env.OLLAMA_MODEL || 'llama3.1'),
    prompt,
  };
}

function formatRecordedActions(actions) {
  return actions
    .map((action, index) => {
      const parts = [`${index + 1}. type=${action.type || 'unknown'}`];

      if (action.selector) {
        parts.push(`selector=${action.selector}`);
      }

      if (action.value) {
        parts.push(`value=${action.value}`);
      }

      if (action.text) {
        parts.push(`text=${action.text}`);
      }

      if (action.url) {
        parts.push(`url=${action.url}`);
      }

      return parts.join(' | ');
    })
    .join('\n');
}

async function generateScriptFromRecording({ title, startUrl, actions, model }) {
  const normalizedTitle = String(title || '').trim();
  const normalizedStartUrl = String(startUrl || '').trim();
  const normalizedActions = Array.isArray(actions) ? actions : [];

  if (!normalizedTitle) {
    throw new Error('Recording title is required');
  }

  if (!normalizedStartUrl) {
    throw new Error('Start URL is required');
  }

  if (!normalizedActions.length) {
    throw new Error('At least one recorded action is required');
  }

  const rawScript = await aiProvider.generateScriptFromRecording(
    [
      RECORDING_SCRIPT_PROMPT,
      `Test title: ${normalizedTitle}`,
      `Start URL: ${normalizedStartUrl}`,
      'Recorded actions:',
      formatRecordedActions(normalizedActions),
    ].join('\n\n'),
  );
  const script = normalizePlaywrightScript(rawScript);

  validateGeneratedPlaywrightScript(script);

  return {
    script,
    model:
      model ||
      (process.env.AI_PROVIDER === 'openai'
        ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
        : process.env.OLLAMA_MODEL || 'llama3.1'),
    prompt: RECORDING_SCRIPT_PROMPT,
  };
}

async function generateManualTestCases(featureDescription, options = {}) {
  const feature = String(featureDescription || '').trim();

  if (!feature) {
    throw new Error('Feature description is required');
  }

  const payload = await aiProvider.generateManualTestCases(
    [
      MANUAL_TEST_CASES_PROMPT,
      `Feature description: ${feature}`,
      'Generate manual test cases in the required JSON format.',
      'Do not include any introduction like "Here are the test cases".',
    ].join('\n\n'),
  );
  const parsed = parseGeneratedTestCasesPayload(
    payload,
    'The AI provider returned invalid JSON for manual test cases',
  );

  if (!parsed) {
    throw new Error('The AI provider returned empty manual test cases');
  }

  if (!Array.isArray(parsed.testCases) || parsed.testCases.length === 0) {
    throw new Error('No test cases were generated');
  }

  return {
    testCases: parsed.testCases.map((testCase) => ({
      title: String(testCase.title || '').trim(),
      steps: Array.isArray(testCase.steps)
        ? testCase.steps.map((step) => String(step).trim()).filter(Boolean)
        : [],
      expectedResult: String(testCase.expectedResult || '').trim(),
    })).filter((testCase) => testCase.title && testCase.steps.length && testCase.expectedResult),
    model:
      options.model ||
      (process.env.AI_PROVIDER === 'openai'
        ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
        : process.env.OLLAMA_MODEL || 'llama3.1'),
    prompt: MANUAL_TEST_CASES_PROMPT,
  };
}

function buildDocumentPrompt(content, type, options = {}) {
  const normalizedType = ['story', 'acceptance_criteria', 'description', 'document'].includes(type)
    ? type
    : 'document';
  const normalizedCount = Number.isInteger(Number(options.count))
    ? Math.max(1, Math.min(Number(options.count), 30))
    : undefined;
  const coverageLevel = ['basic', 'standard', 'detailed'].includes(options.coverageLevel)
    ? options.coverageLevel
    : 'standard';

  return `Input type: ${normalizedType}
Coverage level: ${coverageLevel}
Desired test case count: ${normalizedCount || 'Choose the best count for the feature scope'}

Source content:
${String(content || '').trim()}

Generate structured manual test cases in the required JSON format.`;
}

function normalizeGeneratedPriority(priority) {
  const normalizedPriority = String(priority || '').trim().toLowerCase();

  if (normalizedPriority === 'high') {
    return 'High';
  }

  if (normalizedPriority === 'low') {
    return 'Low';
  }

  return 'Medium';
}

function normalizeGeneratedType(type) {
  const normalizedType = String(type || '').trim().toLowerCase();

  if (normalizedType === 'negative') {
    return 'Negative';
  }

  if (normalizedType === 'edge') {
    return 'Edge';
  }

  if (normalizedType === 'validation') {
    return 'Validation';
  }

  return 'Positive';
}

function normalizeGeneratedTestCases(testCases) {
  return (Array.isArray(testCases) ? testCases : [])
    .map((testCase) => ({
      title: String(testCase.title || '').trim(),
      preconditions: String(testCase.preconditions || 'None').trim() || 'None',
      steps: Array.isArray(testCase.steps)
        ? testCase.steps.map((step) => String(step).trim()).filter(Boolean)
        : [],
      expectedResult: String(testCase.expectedResult || '').trim(),
      priority: normalizeGeneratedPriority(testCase.priority),
      type: normalizeGeneratedType(testCase.type),
      module: String(testCase.module || 'General').trim() || 'General',
    }))
    .filter((testCase) =>
      testCase.title && testCase.steps.length && testCase.expectedResult,
    );
}

async function generateTestCasesFromDocument(content, options = {}) {
  const normalizedContent = String(content || '').trim();

  if (!normalizedContent) {
    throw new Error('Input content is required');
  }

  if (normalizedContent.length < 20) {
    throw new Error('Please provide more detailed content to generate test cases');
  }

  const payload = await aiProvider.generateManualTestCases(
    [
      DOCUMENT_TEST_CASES_PROMPT,
      buildDocumentPrompt(normalizedContent, options.type, {
        count: options.count,
        coverageLevel: options.coverageLevel,
      }),
      'Do not include any explanation, heading, or prose before or after the JSON object.',
    ].join('\n\n'),
  );
  const parsed = parseGeneratedTestCasesPayload(
    payload,
    'The AI provider returned invalid JSON for document-based test cases',
  );

  if (!parsed) {
    throw new Error('The AI provider returned empty document-based test cases');
  }

  if (!Array.isArray(parsed.testCases) || parsed.testCases.length === 0) {
    throw new Error('No test cases were generated from the provided content');
  }

  const testCases = normalizeGeneratedTestCases(parsed.testCases);

  if (!testCases.length) {
    throw new Error('The AI provider did not return usable test cases');
  }

  return {
    summary: String(parsed.summary || 'Generated manual test cases from the provided input.').trim(),
    detectedFlows: Array.isArray(parsed.detectedFlows)
      ? parsed.detectedFlows.map((flow) => String(flow).trim()).filter(Boolean)
      : [],
    testCases,
    model:
      options.model ||
      (process.env.AI_PROVIDER === 'openai'
        ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
        : process.env.OLLAMA_MODEL || 'llama3.1'),
    prompt: DOCUMENT_TEST_CASES_PROMPT,
  };
}

function buildRefinePrompt({ content, testCases, mode, targetCount, instruction }) {
  const normalizedMode = ['shrink', 'expand', 'remove_duplicates', 'feature_scope_only'].includes(mode)
    ? mode
    : 'remove_duplicates';
  const normalizedTargetCount = Number.isInteger(Number(targetCount))
    ? Math.max(1, Math.min(Number(targetCount), 30))
    : '';

  return [
    `Mode: ${normalizedMode}`,
    normalizedTargetCount ? `Target count: ${normalizedTargetCount}` : '',
    instruction ? `Additional instruction: ${String(instruction).trim()}` : '',
    'Source feature/document:',
    String(content || '').trim() || 'No source content provided. Keep only cases that are clearly supported by the provided test case list.',
    'Current test cases JSON:',
    JSON.stringify(Array.isArray(testCases) ? testCases : [], null, 2),
    'Return the refined test cases in the required JSON format.',
  ].filter(Boolean).join('\n\n');
}

async function refineTestCases({ content, testCases, mode, targetCount, instruction, model }) {
  const normalizedCases = Array.isArray(testCases) ? testCases : [];

  if (!normalizedCases.length) {
    throw new Error('`testCases` must be a non-empty array');
  }

  const payload = await aiProvider.generateManualTestCases(
    [
      REFINE_TEST_CASES_PROMPT,
      buildRefinePrompt({ content, testCases: normalizedCases, mode, targetCount, instruction }),
      'Do not include any explanation, heading, or prose before or after the JSON object.',
    ].join('\n\n'),
  );
  const parsed = parseGeneratedTestCasesPayload(
    payload,
    'The AI provider returned invalid JSON for refined test cases',
  );

  if (!parsed) {
    throw new Error('The AI provider returned empty refined test cases');
  }

  let refinedCases = normalizeGeneratedTestCases(parsed.testCases);

  if (mode === 'shrink' && Number.isInteger(Number(targetCount))) {
    refinedCases = refinedCases.slice(0, Math.max(1, Math.min(Number(targetCount), refinedCases.length)));
  }

  if (!refinedCases.length) {
    throw new Error('The AI provider did not return usable refined test cases');
  }

  return {
    summary: String(parsed.summary || 'Refined test cases successfully.').trim(),
    testCases: refinedCases,
    model:
      model ||
      (process.env.AI_PROVIDER === 'openai'
        ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
        : process.env.OLLAMA_MODEL || 'llama3.1'),
    prompt: REFINE_TEST_CASES_PROMPT,
  };
}

module.exports = {
  DOCUMENT_TEST_CASES_PROMPT,
  MANUAL_TEST_CASES_PROMPT,
  PLAYWRIGHT_SCRIPT_PROMPT,
  RECORDING_SCRIPT_PROMPT,
  REFINE_TEST_CASES_PROMPT,
  generateManualTestCases,
  refineTestCases,
  generateScriptFromRecording,
  generateTestCasesFromDocument,
  generatePlaywrightScript,
  validateGeneratedPlaywrightScript,
};
