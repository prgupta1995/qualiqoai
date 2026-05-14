const { VALID_ARIA_ROLES } = require('./universalSelector.service');
const { launchChromium } = require('../utils/browserLauncher');

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id'];
const STABLE_DATA_ATTRIBUTES = ['data-test', 'data-qa', 'data-cy'];
const MAX_CANDIDATES = 160;
const MAX_GENERIC_ELEMENTS = 800;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function cssString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function xpathString(value) {
  const normalizedValue = String(value || '');

  if (!normalizedValue.includes("'")) {
    return `'${normalizedValue}'`;
  }

  if (!normalizedValue.includes('"')) {
    return `"${normalizedValue}"`;
  }

  return `concat('${normalizedValue.replace(/'/g, "', \"'\", '")}')`;
}

function isLikelyStableCssClass(className) {
  const value = String(className || '').trim();

  if (!value || value.length < 3) {
    return false;
  }

  if (/[_-]?[a-f0-9]{6,}$/i.test(value)) {
    return false;
  }

  if (/css-[a-z0-9]+|sc-[a-z0-9]+|chakra-|mantine-|Mui|ant-|__[a-z0-9]+/i.test(value)) {
    return false;
  }

  return /logo|brand|search|login|signin|account|cart|basket|menu|nav|button|input|link|header|footer/i.test(value);
}

function isLikelyStableGenericClass(className) {
  const value = String(className || '').trim();

  if (!/^[A-Za-z_-][A-Za-z0-9_-]{2,48}$/.test(value)) {
    return false;
  }

  if (/[_-]?[a-f0-9]{6,}$/i.test(value)) {
    return false;
  }

  if (/^(css|sc|chakra|mantine|Mui|ant|ng|ember|svelte|astro|x)-/i.test(value)) {
    return false;
  }

  if (/^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|container|row|col|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|w|h|min|max|text|bg|border|rounded|shadow|font|leading|tracking|gap|items|justify|content|self|overflow|opacity|z)-?/i.test(value)) {
    return false;
  }

  return /[A-Za-z]/.test(value);
}

function helperSelectorFromLocator(locator) {
  switch (locator.method) {
    case 'testid':
      return { type: 'testid', value: locator.value };
    case 'role':
      return { type: 'role', role: locator.role, name: locator.name, value: locator.name };
    case 'css':
      return { type: 'css', value: locator.value };
    case 'placeholder':
      return { type: 'placeholder', value: locator.value };
    case 'text':
      return { type: 'text', value: locator.value };
    case 'label':
      return { type: 'label', value: locator.value };
    case 'xpath':
      return { type: 'xpath', value: locator.value };
    default:
      return null;
  }
}

function buildHelperFallbacks(selectors) {
  const seen = new Set();
  const fallbacks = [];

  for (const selector of selectors) {
    const helperSelector = helperSelectorFromLocator(selector.locator);

    if (!helperSelector) {
      continue;
    }

    const signature = `${helperSelector.type}:${helperSelector.value}`;
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    fallbacks.push(helperSelector);
  }

  return fallbacks;
}

function locatorSelectorFromFallbacks(fallbacks) {
  const cssParts = [];
  const xpathParts = [];
  const seen = new Set();

  for (const fallback of Array.isArray(fallbacks) ? fallbacks : []) {
    let selector = '';

    if (fallback.type === 'testid') {
      selector = `[data-testid="${cssString(fallback.value)}"]`;
    } else if (fallback.type === 'placeholder') {
      selector = `input[placeholder="${cssString(fallback.value)}"], textarea[placeholder="${cssString(fallback.value)}"]`;
    } else if (fallback.type === 'css') {
      selector = fallback.value;
    } else if (fallback.type === 'xpath') {
      selector = fallback.value;
    }

    if (!selector) {
      continue;
    }

    if (fallback.type === 'xpath') {
      if (!seen.has(`xpath:${selector}`)) {
        xpathParts.push(selector);
        seen.add(`xpath:${selector}`);
      }
      continue;
    }

    for (const part of selector.split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!seen.has(`css:${part}`)) {
        cssParts.push(part);
        seen.add(`css:${part}`);
      }
    }
  }

  return cssParts.length ? cssParts.slice(0, 4).join(', ') : xpathParts[0] || '';
}

function toWords(value) {
  return normalizeText(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeUrl(rawUrl) {
  const value = String(rawUrl || '').trim();

  if (!value) {
    throw new Error('`url` is required');
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function originOf(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
}

function isIgnoredFrameUrl(frameUrl) {
  return /recaptcha|captcha|qualaroo|doubleclick|googletagmanager/i.test(String(frameUrl || ''));
}

function isIgnoredCandidate(candidate) {
  const searchable = [
    candidate.id,
    candidate.role,
    candidate.text,
    candidate.ariaLabel,
    candidate.alt,
    candidate.title,
    candidate.href,
    candidate.src,
    (candidate.classNames || []).join(' '),
    Object.values(candidate.dataAttributes || {}).join(' '),
    candidate.frameMeta?.url,
  ].join(' ').toLowerCase();

  return /recaptcha|captcha|grecaptcha|rc-anchor|qualaroo/.test(searchable);
}

function getRectOverlapRatio(firstRect, secondRect) {
  if (!firstRect || !secondRect) {
    return 0;
  }

  const left = Math.max(firstRect.x, secondRect.x);
  const right = Math.min(firstRect.x + firstRect.width, secondRect.x + secondRect.width);
  const top = Math.max(firstRect.y, secondRect.y);
  const bottom = Math.min(firstRect.y + firstRect.height, secondRect.y + secondRect.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersection = width * height;
  const smallerArea = Math.min(
    Math.max(1, firstRect.width * firstRect.height),
    Math.max(1, secondRect.width * secondRect.height),
  );

  return intersection / smallerArea;
}

function areRelatedCandidates(firstCandidate, secondCandidate) {
  if (firstCandidate === secondCandidate) {
    return true;
  }

  if (!firstCandidate || !secondCandidate) {
    return false;
  }

  if (firstCandidate.parentHref && firstCandidate.parentHref === secondCandidate.href) {
    return true;
  }

  if (secondCandidate.parentHref && secondCandidate.parentHref === firstCandidate.href) {
    return true;
  }

  return getRectOverlapRatio(firstCandidate.rect, secondCandidate.rect) > 0.75;
}

function getPurposeProfile(elementPurpose) {
  const purpose = normalizeText(elementPurpose).toLowerCase();
  const words = toWords(purpose).filter((word) =>
    !(purpose.includes('logo') && ['homepage', 'home', 'page'].includes(word)),
  );
  const synonyms = new Set(words);

  if (purpose.includes('logo')) {
    synonyms.add('logo');
  }

  if (purpose.includes('search')) {
    ['search', 'query', 'keyword', 'find'].forEach((word) => synonyms.add(word));
  }

  if (purpose.includes('login') || purpose.includes('sign in')) {
    ['login', 'signin', 'sign', 'in', 'account'].forEach((word) => synonyms.add(word));
  }

  if (purpose.includes('cart') || purpose.includes('basket')) {
    ['cart', 'basket', 'bag', 'checkout'].forEach((word) => synonyms.add(word));
  }

  if (purpose.includes('menu') || purpose.includes('hamburger')) {
    ['menu', 'navigation', 'nav', 'hamburger'].forEach((word) => synonyms.add(word));
  }

  if (purpose.includes('footer')) {
    ['footer', 'contentinfo'].forEach((word) => synonyms.add(word));
  }

  if (purpose.includes('banner') || purpose.includes('header')) {
    ['banner', 'header', 'hero'].forEach((word) => synonyms.add(word));
  }

  return {
    purpose,
    words,
    synonyms: [...synonyms],
  };
}

function buildFrameSelector(frameMeta) {
  if (!frameMeta || frameMeta.isMainFrame) {
    return {
      prefix: 'page',
      context: 'main document',
      frameLocator: '',
    };
  }

  if (frameMeta.name) {
    const frameLocator = `iframe[name="${cssString(frameMeta.name)}"]`;
    return {
      prefix: `page.frameLocator('${frameLocator}')`,
      context: `iframe[name="${frameMeta.name}"]`,
      frameLocator,
    };
  }

  if (frameMeta.id) {
    const frameLocator = `iframe#${cssString(frameMeta.id)}`;
    return {
      prefix: `page.frameLocator('${frameLocator}')`,
      context: `iframe#${frameMeta.id}`,
      frameLocator,
    };
  }

  if (frameMeta.title) {
    const frameLocator = `iframe[title="${cssString(frameMeta.title)}"]`;
    return {
      prefix: `page.frameLocator('${frameLocator}')`,
      context: `iframe[title="${frameMeta.title}"]`,
      frameLocator,
    };
  }

  if (frameMeta.src) {
    const frameLocator = `iframe[src="${cssString(frameMeta.src)}"]`;
    return {
      prefix: `page.frameLocator('${frameLocator}')`,
      context: `iframe[src="${frameMeta.src}"]`,
      frameLocator,
    };
  }

  return {
    prefix: 'page',
    context: typeof frameMeta.frameIndex === 'number'
      ? `iframe detected at index ${frameMeta.frameIndex}, but no stable iframe selector was available`
      : 'iframe detected, but no stable iframe selector was available',
    frameLocator: '',
  };
}

function inferRole(candidate) {
  if (candidate.role) {
    return candidate.role;
  }

  if (candidate.tag === 'a' && candidate.href) return 'link';
  if (candidate.tag === 'button') return 'button';
  if (candidate.tag === 'img' || candidate.tag === 'svg') return 'img';
  if (candidate.tag === 'input' && ['search'].includes(candidate.inputType)) return 'searchbox';
  if (candidate.tag === 'input' || candidate.tag === 'textarea') return 'textbox';
  if (candidate.tag === 'select') return 'combobox';
  if (candidate.tag === 'nav') return 'navigation';
  if (candidate.tag === 'footer') return 'contentinfo';
  if (candidate.tag === 'header') return 'banner';

  return '';
}

function accessibleName(candidate) {
  return normalizeText(
    candidate.ariaLabel ||
      candidate.alt ||
      candidate.title ||
      candidate.placeholder ||
      candidate.text ||
      candidate.name ||
      '',
  );
}

function scoreCandidate(candidate, profile) {
  if (isIgnoredCandidate(candidate)) {
    return 0;
  }

  const searchable = [
    candidate.tag,
    candidate.role,
    candidate.text,
    candidate.ariaLabel,
    candidate.alt,
    candidate.title,
    candidate.placeholder,
    candidate.name,
    candidate.id,
    candidate.href,
    candidate.src,
    (candidate.classNames || []).join(' '),
    Object.values(candidate.dataAttributes || {}).join(' '),
  ].join(' ').toLowerCase();
  let relevance = 0;
  let stabilityBoost = 0;

  for (const word of profile.synonyms) {
    if (word && searchable.includes(word)) {
      relevance += 8;
    }
  }

  if (candidate.dataAttributes?.['data-testid']) stabilityBoost += 30;
  if (candidate.dataAttributes?.['data-test-id']) stabilityBoost += 26;
  if (STABLE_DATA_ATTRIBUTES.some((attr) => candidate.dataAttributes?.[attr])) stabilityBoost += 20;

  const purpose = profile.purpose;
  const role = inferRole(candidate);

  if (purpose.includes('logo')) {
    const logoFields = [
      candidate.ariaLabel,
      candidate.alt,
      candidate.title,
      candidate.id,
      candidate.href,
      (candidate.classNames || []).join(' '),
      Object.values(candidate.dataAttributes || {}).join(' '),
    ].join(' ').toLowerCase();
    const href = String(candidate.href || '');
    const isHomeLink = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/i.test(href) ||
      /^\/[a-z]{2}-[a-z]{2}\/?$/i.test(href);
    const hasLogoField = /\blogo\b|brand/.test(logoFields);
    const hasLogoLikeTag = ['a', 'img', 'svg'].includes(candidate.tag);

    if (hasLogoField) relevance += 48;
    if (hasLogoLikeTag && isHomeLink) relevance += 24;
    if (candidate.tag === 'svg' && hasLogoField) relevance += 12;
    if (candidate.rect && candidate.rect.y <= 180 && (hasLogoField || (hasLogoLikeTag && isHomeLink))) relevance += 12;
    if (candidate.rect && candidate.rect.y > 300 && !hasLogoField) relevance -= 30;
  }

  if (purpose.includes('search')) {
    if (['searchbox', 'textbox'].includes(role) && /search|looking|query|keyword|find/.test(searchable)) relevance += 28;
  }

  if (purpose.includes('login') || purpose.includes('sign in')) {
    if (['button', 'link'].includes(role) && /log\s*in|login|sign\s*in|signin|account/.test(searchable)) relevance += 28;
  }

  if (purpose.includes('cart') || purpose.includes('basket')) {
    if (['button', 'link'].includes(role) && /cart|basket|bag|checkout/.test(searchable)) relevance += 28;
  }

  if (purpose.includes('menu') || purpose.includes('hamburger')) {
    if (['button', 'navigation'].includes(role) && /menu|navigation|nav|hamburger|categories/.test(searchable)) relevance += 24;
  }

  if (purpose.includes('footer')) {
    if (candidate.tag === 'footer' || role === 'contentinfo' || /footer|contentinfo/.test(searchable)) relevance += 28;
  }

  if (purpose.includes('banner') || purpose.includes('header')) {
    if (candidate.tag === 'header' || role === 'banner' || /banner|header|hero/.test(searchable)) relevance += 24;
  }

  if (relevance === 0) {
    return 0;
  }

  if (candidate.visible) stabilityBoost += 10;
  if (candidate.text && candidate.text.length > 80) stabilityBoost -= 10;

  return relevance + stabilityBoost;
}

function buildCandidateSelectors(candidate, frameMeta) {
  const frameSelector = buildFrameSelector(frameMeta);
  const prefix = frameSelector.prefix;
  const selectors = [];

  for (const attr of TEST_ID_ATTRIBUTES) {
    const value = candidate.dataAttributes?.[attr];
    if (value && attr === 'data-testid') {
      selectors.push({
        selector: `${prefix}.getByTestId(${jsString(value)})`,
        locator: { method: 'testid', value, frameMeta },
        selectorType: 'testid',
        baseScore: 100,
        reason: `Unique ${attr} attribute found on ${candidate.tag.toUpperCase()} element`,
      });
    } else if (value) {
      selectors.push({
        selector: `${prefix}.locator('[${attr}="${cssString(value)}"]')`,
        locator: { method: 'css', value: `[${attr}="${cssString(value)}"]`, frameMeta },
        selectorType: 'css',
        baseScore: 98,
        reason: `Stable ${attr} attribute found on ${candidate.tag.toUpperCase()} element`,
      });
    }
  }

  for (const attr of STABLE_DATA_ATTRIBUTES) {
    const value = candidate.dataAttributes?.[attr];
    if (value) {
      selectors.push({
        selector: `${prefix}.locator('[${attr}="${cssString(value)}"]')`,
        locator: { method: 'css', value: `[${attr}="${cssString(value)}"]`, frameMeta },
        selectorType: 'css',
        baseScore: 96,
        reason: `Stable ${attr} attribute found on ${candidate.tag.toUpperCase()} element`,
      });
    }
  }

  if (candidate.parentHref && candidate.dataAttributes?.['data-testid']) {
    selectors.push({
      selector: `${prefix}.locator('a[href="${cssString(candidate.parentHref)}"]:has([data-testid="${cssString(candidate.dataAttributes['data-testid'])}"])')`,
      locator: {
        method: 'css',
        value: `a[href="${cssString(candidate.parentHref)}"]:has([data-testid="${cssString(candidate.dataAttributes['data-testid'])}"])`,
        frameMeta,
      },
      selectorType: 'css',
      baseScore: 99,
      reason: `Scoped parent link href "${candidate.parentHref}" contains data-testid "${candidate.dataAttributes['data-testid']}"`,
    });
  }

  if (candidate.tag === 'a' && candidate.href && Array.isArray(candidate.descendantTestIds)) {
    for (const testId of candidate.descendantTestIds.slice(0, 2)) {
      selectors.push({
        selector: `${prefix}.locator('a[href="${cssString(candidate.href)}"]:has([data-testid="${cssString(testId)}"])')`,
        locator: {
          method: 'css',
          value: `a[href="${cssString(candidate.href)}"]:has([data-testid="${cssString(testId)}"])`,
          frameMeta,
        },
        selectorType: 'css',
        baseScore: 99,
        reason: `Link href "${candidate.href}" contains data-testid "${testId}"`,
      });
    }
  }

  if (candidate.id && !/[_-]?[a-f0-9]{8,}$/i.test(candidate.id)) {
    selectors.push({
      selector: `${prefix}.locator('#${cssString(candidate.id)}')`,
      locator: { method: 'css', value: `#${cssString(candidate.id)}`, frameMeta },
      selectorType: 'css',
      baseScore: 90,
      reason: `Stable id "${candidate.id}" found on ${candidate.tag.toUpperCase()} element`,
    });
  }

  if (candidate.name && ['input', 'textarea', 'select', 'button'].includes(candidate.tag)) {
    selectors.push({
      selector: `${prefix}.locator('${candidate.tag}[name="${cssString(candidate.name)}"]')`,
      locator: { method: 'css', value: `${candidate.tag}[name="${cssString(candidate.name)}"]`, frameMeta },
      selectorType: 'css',
      baseScore: 80,
      reason: `Name attribute "${candidate.name}" is available on ${candidate.tag.toUpperCase()} element`,
    });
  }

  if (candidate.ariaLabel) {
    selectors.push({
      selector: `${prefix}.locator('[aria-label="${cssString(candidate.ariaLabel)}"]')`,
      locator: { method: 'css', value: `[aria-label="${cssString(candidate.ariaLabel)}"]`, frameMeta },
      selectorType: 'css',
      baseScore: 70,
      reason: `ARIA label attribute is available on ${candidate.tag.toUpperCase()} element`,
    });
  }

  if (candidate.placeholder) {
    selectors.push({
      selector: `${prefix}.getByPlaceholder(${jsString(candidate.placeholder)}, { exact: true })`,
      locator: { method: 'placeholder', value: candidate.placeholder, frameMeta },
      selectorType: 'placeholder',
      baseScore: 60,
      reason: `Unique placeholder "${candidate.placeholder}" is available`,
    });
  }

  const role = inferRole(candidate);
  const name = accessibleName(candidate);
  if (role && name && VALID_ARIA_ROLES.has(role)) {
    selectors.push({
      selector: `${prefix}.getByRole('${role}', { name: ${jsString(name)}, exact: true })`,
      locator: { method: 'role', role, name, frameMeta },
      selectorType: 'role',
      baseScore: 50,
      reason: `Semantic role "${role}" with accessible name "${name}" is available`,
    });
  }

  if (candidate.label) {
    selectors.push({
      selector: `${prefix}.getByLabel(${jsString(candidate.label)}, { exact: true })`,
      locator: { method: 'label', value: candidate.label, frameMeta },
      selectorType: 'label',
      baseScore: 58,
      reason: `Associated form label "${candidate.label}" is available`,
    });
  }

  if (candidate.href && candidate.tag === 'a') {
    selectors.push({
      selector: `${prefix}.locator('a[href="${cssString(candidate.href)}"]')`,
      locator: { method: 'css', value: `a[href="${cssString(candidate.href)}"]`, frameMeta },
      selectorType: 'css',
      baseScore: 40,
      reason: `Link href "${candidate.href}" is available`,
    });
  }

  if (candidate.src && ['img', 'svg', 'source'].includes(candidate.tag)) {
    selectors.push({
      selector: `${prefix}.locator('${candidate.tag}[src="${cssString(candidate.src)}"]')`,
      locator: { method: 'css', value: `${candidate.tag}[src="${cssString(candidate.src)}"]`, frameMeta },
      selectorType: 'css',
      baseScore: 40,
      reason: `Source attribute is available on ${candidate.tag.toUpperCase()} element`,
    });
  }

  if (candidate.alt && candidate.tag === 'img') {
    selectors.push({
      selector: `${prefix}.locator('img[alt="${cssString(candidate.alt)}"]')`,
      locator: { method: 'css', value: `img[alt="${cssString(candidate.alt)}"]`, frameMeta },
      selectorType: 'css',
      baseScore: 40,
      reason: `Image alt text is available and can identify the image`,
    });
  }

  for (const className of candidate.classNames || []) {
    if (isLikelyStableCssClass(className)) {
      selectors.push({
        selector: `${prefix}.locator('.${cssString(className)}')`,
        locator: { method: 'css', value: `.${cssString(className)}`, frameMeta },
        selectorType: 'css',
        baseScore: 30,
        reason: `Stable class "${className}" found on ${candidate.tag.toUpperCase()} element`,
      });
    }
  }

  if (candidate.text && candidate.text.length <= 60 && !['div', 'span', 'svg'].includes(candidate.tag)) {
    selectors.push({
      selector: `${prefix}.getByText(${jsString(candidate.text)}, { exact: true })`,
      locator: { method: 'text', value: candidate.text, frameMeta },
      selectorType: 'text',
      baseScore: 20,
      reason: `Visible exact text "${candidate.text}" identifies the element`,
    });
  }

  if (candidate.tag === 'a' && (candidate.text || candidate.href)) {
    const value = candidate.text || candidate.href;
    selectors.push({
      selector: `${prefix}.locator('//a[contains(normalize-space(), ${xpathString(value)}) or contains(@href, ${xpathString(value)})]')`,
      locator: {
        method: 'xpath',
        value: `//a[contains(normalize-space(), ${xpathString(value)}) or contains(@href, ${xpathString(value)})]`,
        frameMeta,
      },
      selectorType: 'xpath',
      baseScore: 10,
      reason: `XPath fallback based on link text or href is available`,
    });
  } else if (['button', 'input'].includes(candidate.tag) && (candidate.text || candidate.name || candidate.placeholder)) {
    const value = candidate.text || candidate.name || candidate.placeholder;
    selectors.push({
      selector: `${prefix}.locator('//*[self::button or self::input][contains(normalize-space(), ${xpathString(value)}) or contains(@name, ${xpathString(value)}) or contains(@placeholder, ${xpathString(value)}) or contains(@value, ${xpathString(value)})]')`,
      locator: {
        method: 'xpath',
        value: `//*[self::button or self::input][contains(normalize-space(), ${xpathString(value)}) or contains(@name, ${xpathString(value)}) or contains(@placeholder, ${xpathString(value)}) or contains(@value, ${xpathString(value)})]`,
        frameMeta,
      },
      selectorType: 'xpath',
      baseScore: 10,
      reason: `XPath fallback based on form control text or attributes is available`,
    });
  } else if (candidate.tag === 'img' && (candidate.alt || candidate.src)) {
    const value = candidate.alt || candidate.src;
    selectors.push({
      selector: `${prefix}.locator('//img[contains(@alt, ${xpathString(value)}) or contains(@src, ${xpathString(value)})]')`,
      locator: {
        method: 'xpath',
        value: `//img[contains(@alt, ${xpathString(value)}) or contains(@src, ${xpathString(value)})]`,
        frameMeta,
      },
      selectorType: 'xpath',
      baseScore: 10,
      reason: `XPath fallback based on image alt or src is available`,
    });
  }

  return selectors.map((selector) => ({
    ...selector,
    context: frameSelector.context,
  }));
}

async function resolveLocator(page, descriptor) {
  const frameSelector = buildFrameSelector(descriptor.frameMeta);
  let target = page;

  if (descriptor.frameMeta && !descriptor.frameMeta.isMainFrame) {
    if (frameSelector.frameLocator) {
      target = page.frameLocator(frameSelector.frameLocator);
    } else if (typeof descriptor.frameMeta.frameIndex === 'number' && page.frames()[descriptor.frameMeta.frameIndex]) {
      target = page.frames()[descriptor.frameMeta.frameIndex];
    }
  }

  switch (descriptor.method) {
    case 'testid':
      return target.getByTestId(descriptor.value);
    case 'role':
      return target.getByRole(descriptor.role, { name: descriptor.name, exact: true });
    case 'label':
      return target.getByLabel(descriptor.value, { exact: true });
    case 'placeholder':
      return target.getByPlaceholder(descriptor.value, { exact: true });
    case 'text':
      return target.getByText(descriptor.value, { exact: true });
    case 'xpath':
      return target.locator(descriptor.value);
    case 'css':
    default:
      return target.locator(descriptor.value);
  }
}

async function verifySelector(page, selectorCandidate) {
  try {
    const locator = await resolveLocator(page, selectorCandidate.locator);
    const count = await locator.count();

    if (count !== 1) {
      return { ok: false, count };
    }

    const visible = await locator.first().isVisible().catch(() => false);
    return { ok: true, count, visible };
  } catch (err) {
    return { ok: false, count: 0, error: err.message };
  }
}

function playwrightTextSelector(value) {
  return `text=${jsString(value)}`;
}

function playwrightRoleSelector(role, name) {
  return `role=${role}[name=${jsString(name)}]`;
}

function buildGenericSelectorCandidates(element) {
  const candidates = [];
  const tag = String(element.tagName || element.tag || '').toLowerCase();
  const add = (selectorType, selector, score) => {
    if (!selector) {
      return;
    }

    candidates.push({ selectorType, selector, score });
  };

  for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-test-id', 'data-cy']) {
    const value = element.dataAttributes?.[attr];
    if (value) {
      add(attr === 'data-testid' ? 'data-testid' : attr, `[${attr}="${cssString(value)}"]`, 120);
    }
  }

  if (element.id && !/[_-]?[a-f0-9]{8,}$/i.test(element.id)) {
    add('id', `[id="${cssString(element.id)}"]`, 110);
  }

  if (tag === 'a' && element.href) {
    add('href', `a[href="${cssString(element.href)}"]`, 100);
  }

  if (element.name && tag) {
    add('name', `${tag}[name="${cssString(element.name)}"]`, 90);
  }

  if (element.placeholder && ['input', 'textarea'].includes(tag)) {
    add('placeholder', `${tag}[placeholder="${cssString(element.placeholder)}"]`, 85);
  }

  if (element.ariaLabel) {
    add('aria-label', `[aria-label="${cssString(element.ariaLabel)}"]`, 80);
  }

  if (element.wrappedLabel && ['input', 'textarea', 'select'].includes(tag)) {
    add('label', `label:has-text(${jsString(element.wrappedLabel)}) ${tag}`, 76);
  }

  if (element.alt && tag === 'img') {
    add('alt', `img[alt="${cssString(element.alt)}"]`, 72);
  }

  if (element.title) {
    add('title', `${tag}[title="${cssString(element.title)}"]`, 70);
    add('title', `[title="${cssString(element.title)}"]`, 69);
  }

  const role = String(inferRole({
    ...element,
    tag,
    inputType: element.inputType || '',
  }) || '').toLowerCase();
  const roleName = accessibleName({
    ...element,
    tag,
  });
  if (role && roleName && VALID_ARIA_ROLES.has(role)) {
    add('role', playwrightRoleSelector(role, roleName), 64);
  }

  for (const className of element.classNames || []) {
    if (isLikelyStableGenericClass(className)) {
      add('css', `.${cssString(className)}`, 50);
      if (tag) {
        add('css', `${tag}.${cssString(className)}`, 49);
      }
    }
  }

  if (element.text && element.text.length <= 80) {
    add('text', playwrightTextSelector(element.text), 36);
  }

  if (element.text && tag && element.text.length <= 100) {
    add('xpath', `xpath=//${tag}[normalize-space(.)=${xpathString(element.text)}]`, 20);
  } else if (element.href && tag === 'a') {
    add('xpath', `xpath=//a[@href=${xpathString(element.href)}]`, 18);
  } else if (element.placeholder && ['input', 'textarea'].includes(tag)) {
    add('xpath', `xpath=//${tag}[@placeholder=${xpathString(element.placeholder)}]`, 18);
  } else if (element.name && tag) {
    add('xpath', `xpath=//${tag}[@name=${xpathString(element.name)}]`, 18);
  }

  const seen = new Set();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      const signature = `${candidate.selectorType}:${candidate.selector}`;
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
}

async function resolveGenericTarget(page, frameMeta) {
  if (frameMeta && !frameMeta.isMainFrame && typeof frameMeta.frameIndex === 'number') {
    return page.frames()[frameMeta.frameIndex] || page;
  }

  return page;
}

async function verifyGenericSelector(page, frameMeta, selector) {
  try {
    const target = await resolveGenericTarget(page, frameMeta);
    const locator = target.locator(selector);
    const count = await locator.count();
    const visible = count > 0 ? await locator.first().isVisible().catch(() => false) : false;
    return { count, visible };
  } catch (error) {
    return { count: 0, visible: false, error: error.message };
  }
}

async function chooseGenericSelector(page, element) {
  const candidates = buildGenericSelectorCandidates(element);
  const allSelectors = candidates.map((candidate) => ({
    selector: candidate.selector,
    selectorType: candidate.selectorType,
  }));
  let firstWorkingSelector = null;

  for (const candidate of candidates) {
    const verified = await verifyGenericSelector(page, element.frameMeta, candidate.selector);

    if (verified.count === 1 && verified.visible) {
      return {
        ...candidate,
        matchCount: verified.count,
        strict: true,
        allSelectors,
      };
    }

    if (!firstWorkingSelector && verified.count > 0) {
      firstWorkingSelector = {
        ...candidate,
        matchCount: verified.count,
        strict: false,
        allSelectors,
      };
    }
  }

  return firstWorkingSelector || {
    selectorType: 'xpath',
    selector: '',
    matchCount: 0,
    strict: false,
    allSelectors,
  };
}

function normalizeElementType(element) {
  const tag = String(element.tagName || element.tag || '').toLowerCase();
  const role = String(element.role || '').toLowerCase();
  const inputType = String(element.inputType || '').toLowerCase();

  if (tag === 'a') return 'link';
  if (tag === 'button' || inputType === 'button' || inputType === 'submit' || role === 'button') return 'button';
  if (['input', 'textarea'].includes(tag)) return 'input';
  if (tag === 'select' || role === 'combobox' || role === 'listbox') return 'dropdown';
  if (tag === 'img' || tag === 'svg' || role === 'img') return 'image';
  if (/^h[1-6]$/.test(tag) || tag === 'label') return 'text';
  return 'other';
}

function genericElementName(element) {
  const elementType = normalizeElementType(element);
  const identity = normalizeText(
    element.label ||
      element.placeholder ||
      element.text ||
      element.ariaLabel ||
      element.alt ||
      element.title ||
      element.name ||
      element.id ||
      (element.stableClassNames || []).join(' ') ||
      element.href ||
      element.role ||
      element.tagName ||
      '',
  );

  return identity ? `${elementType}: ${identity.slice(0, 80)}` : `${elementType}: ${element.tagName || 'element'}`;
}

function elementTypeToTag(elementType) {
  const normalizedType = String(elementType || '').trim().toLowerCase();

  if (normalizedType === 'button') return 'button';
  if (normalizedType === 'link') return 'a';
  if (normalizedType === 'input') return 'input';
  if (normalizedType === 'dropdown') return 'select';
  if (normalizedType === 'image') return 'img';

  return '';
}

function selectorTypeForManualSelector(selector) {
  if (/^xpath=|^\/\//i.test(selector)) return 'xpath';
  if (/^text=/i.test(selector) || /:has-text\(/i.test(selector)) return 'text';
  if (/\[placeholder[*^$]?=/i.test(selector)) return 'placeholder';
  if (/label:has-text|\[aria-label[*^$]?=/i.test(selector)) return 'label';
  if (/\[name[*^$]?=/i.test(selector)) return 'name';
  return 'css';
}

function pushManualSelector(candidates, selector, selectorType = selectorTypeForManualSelector(selector)) {
  const normalizedSelector = String(selector || '').trim();

  if (!normalizedSelector || candidates.some((candidate) => candidate.selector === normalizedSelector)) {
    return;
  }

  candidates.push({
    selector: normalizedSelector,
    selectorType,
  });
}

function generateManualSelector({ text = '', label = '', placeholder = '', elementType = 'other' } = {}) {
  const normalizedText = normalizeText(text);
  const normalizedLabel = normalizeText(label);
  const normalizedPlaceholder = normalizeText(placeholder);
  const normalizedElementType = String(elementType || 'other').trim().toLowerCase();
  const tag = elementTypeToTag(normalizedElementType);
  const candidates = [];

  if (normalizedText) {
    if (tag) {
      pushManualSelector(candidates, `${tag}:has-text(${jsString(normalizedText)})`, 'text');
    }

    if (normalizedElementType === 'button') {
      pushManualSelector(candidates, `input[type="button"][value*="${cssString(normalizedText)}" i]`, 'text');
      pushManualSelector(candidates, `input[type="submit"][value*="${cssString(normalizedText)}" i]`, 'text');
    }

    pushManualSelector(candidates, `text=${jsString(normalizedText)}`, 'text');
    pushManualSelector(candidates, `xpath=//*[contains(normalize-space(), ${xpathString(normalizedText)})]`, 'xpath');
  }

  if (normalizedPlaceholder) {
    pushManualSelector(candidates, `input[placeholder*="${cssString(normalizedPlaceholder)}" i]`, 'placeholder');
    pushManualSelector(candidates, `textarea[placeholder*="${cssString(normalizedPlaceholder)}" i]`, 'placeholder');
  }

  if (normalizedLabel) {
    const labelToken = toWords(normalizedLabel).join('-') || normalizedLabel;
    pushManualSelector(candidates, `label:has-text(${jsString(normalizedLabel)})`, 'label');
    pushManualSelector(candidates, `input[aria-label*="${cssString(normalizedLabel)}" i]`, 'label');
    pushManualSelector(candidates, `textarea[aria-label*="${cssString(normalizedLabel)}" i]`, 'label');
    pushManualSelector(candidates, `select[aria-label*="${cssString(normalizedLabel)}" i]`, 'label');
    pushManualSelector(candidates, `input[name*="${cssString(labelToken)}" i]`, 'name');
    pushManualSelector(candidates, `textarea[name*="${cssString(labelToken)}" i]`, 'name');
    pushManualSelector(candidates, `select[name*="${cssString(labelToken)}" i]`, 'name');
  }

  if (!candidates.length) {
    throw new Error('Provide text, label, or placeholder to generate a manual selector');
  }

  const [primary] = candidates;
  return {
    selector: primary.selector,
    selectorType: primary.selectorType,
    allSelectors: candidates,
  };
}

async function collectGenericFrameElements(frame, frameMeta, maxElements) {
  return frame.evaluate(({ frameMetaPayload, maxElements: maxElementCount }) => {
    const DATA_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-test-id', 'data-cy'];
    const ELEMENT_QUERY = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      'img',
      'svg',
      'form',
      'summary',
      'label',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      '[role]',
      '[aria-label]',
      '[title]',
      '[alt]',
      '[href]',
      '[name]',
      '[placeholder]',
      '[id]',
      '[data-testid]',
      '[data-test]',
      '[data-qa]',
      '[data-test-id]',
      '[data-cy]',
      '[class]',
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])',
      '[onclick]',
    ].join(',');

    function textOf(element) {
      return String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function directTextOf(element) {
      return [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function isLikelyStableClass(className) {
      const value = String(className || '').trim();

      if (!/^[A-Za-z_-][A-Za-z0-9_-]{2,48}$/.test(value)) return false;
      if (/[_-]?[a-f0-9]{6,}$/i.test(value)) return false;
      if (/^(css|sc|chakra|mantine|Mui|ant|ng|ember|svelte|astro|x)-/i.test(value)) return false;
      if (/^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|container|row|col|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|w|h|min|max|text|bg|border|rounded|shadow|font|leading|tracking|gap|items|justify|content|self|overflow|opacity|z)-?/i.test(value)) return false;

      return /[A-Za-z]/.test(value);
    }

    function stableClassNamesOf(element) {
      return [...element.classList].filter(isLikelyStableClass).slice(0, 5);
    }

    function readableTextOf(element) {
      const tag = element.tagName.toLowerCase();
      const directText = directTextOf(element);

      if (['div', 'span', 'section', 'form', 'header', 'footer', 'nav'].includes(tag)) {
        return (directText || '').slice(0, 180);
      }

      return textOf(element).slice(0, 180);
    }

    function hasStableIdentifier(element) {
      if (element.id || element.getAttribute('name') || element.getAttribute('aria-label') || element.getAttribute('title')) {
        return true;
      }

      return DATA_ATTRIBUTES.some((attr) => Boolean(element.getAttribute(attr))) ||
        stableClassNamesOf(element).length > 0;
    }

    function isVisible(element) {
      if (element.hidden || element.closest('[hidden]')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      if (element.tagName.toLowerCase() === 'input' && element.getAttribute('type') === 'hidden') return false;

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0;
    }

    function isDisabled(element) {
      return Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';
    }

    function sectionOf(element) {
      if (element.closest('header,[role="banner"]')) return 'header';
      if (element.closest('footer,[role="contentinfo"]')) return 'footer';
      if (element.closest('nav,[role="navigation"]')) return 'nav';
      if (element.closest('form')) return 'form';
      if (element.closest('main,[role="main"]')) return 'main';
      return 'unknown';
    }

    function labelDetails(element) {
      if (element.id) {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (explicitLabel) {
          return {
            label: textOf(explicitLabel),
            wrappedLabel: '',
          };
        }
      }

      const wrappedLabel = element.closest('label');
      const wrappedLabelText = wrappedLabel ? textOf(wrappedLabel) : '';
      return {
        label: wrappedLabelText,
        wrappedLabel: wrappedLabelText,
      };
    }

    function isUseful(element) {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role') || '';
      const text = textOf(element);
      const directText = directTextOf(element);
      const stableClassNames = stableClassNamesOf(element);
      const isInteractive = [
        'a',
        'button',
        'input',
        'textarea',
        'select',
        'summary',
        'label',
        'img',
        'svg',
      ].includes(tag) ||
        role ||
        element.getAttribute('contenteditable') === 'true' ||
        element.getAttribute('tabindex') !== null ||
        element.getAttribute('onclick') !== null;
      const hasMeaningfulAttribute = hasStableIdentifier(element) ||
        element.getAttribute('placeholder') ||
        element.getAttribute('alt') ||
        element.getAttribute('href');
      const isTextElement = /^h[1-6]$/.test(tag) || tag === 'label';

      if (isInteractive || hasMeaningfulAttribute || isTextElement) {
        return true;
      }

      if (['div', 'span', 'section', 'main', 'header', 'footer', 'nav'].includes(tag)) {
        return (directText.length > 0 && directText.length <= 120) || stableClassNames.length > 0;
      }

      return text.length > 0 && text.length <= 160;
    }

    return [...new Set([...document.querySelectorAll(ELEMENT_QUERY)])]
      .filter((element) => isVisible(element))
      .filter((element) => !isDisabled(element) || hasStableIdentifier(element))
      .filter((element) => isUseful(element))
      .slice(0, maxElementCount)
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const rect = element.getBoundingClientRect();
        const dataAttributes = {};
        for (const attr of DATA_ATTRIBUTES) {
          const value = element.getAttribute(attr);
          if (value) dataAttributes[attr] = value;
        }
        const labels = labelDetails(element);
        const stableClassNames = stableClassNamesOf(element);

        return {
          frameMeta: frameMetaPayload,
          tagName: tag,
          tag,
          role: element.getAttribute('role') || '',
          text: readableTextOf(element),
          label: labels.label.slice(0, 180),
          wrappedLabel: labels.wrappedLabel.slice(0, 180),
          ariaLabel: element.getAttribute('aria-label') || '',
          alt: element.getAttribute('alt') || '',
          title: element.getAttribute('title') || '',
          placeholder: element.getAttribute('placeholder') || '',
          name: element.getAttribute('name') || '',
          id: element.id || '',
          href: element.getAttribute('href') || '',
          src: element.getAttribute('src') || '',
          inputType: element.getAttribute('type') || '',
          section: sectionOf(element),
          classNames: [...element.classList].slice(0, 12),
          stableClassNames,
          dataAttributes,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          disabled: isDisabled(element),
        };
      });
  }, { frameMetaPayload: frameMeta, maxElements });
}

async function buildFrameMeta(page, frame, frameIndex, mainOrigin) {
  const isMainFrame = frame === page.mainFrame();
  let frameElementMeta = {};
  let isFrameVisible = true;

  if (!isMainFrame) {
    const frameElement = await frame.frameElement().catch(() => null);
    if (frameElement) {
      isFrameVisible = await frameElement.isVisible().catch(() => true);
      frameElementMeta = await frameElement.evaluate((iframe) => ({
        id: iframe.id || '',
        name: iframe.getAttribute('name') || '',
        title: iframe.getAttribute('title') || '',
        src: iframe.getAttribute('src') || '',
      })).catch(() => ({}));
    }
  }

  const frameOrigin = originOf(frame.url());
  return {
    isMainFrame,
    frameIndex,
    url: frame.url(),
    isCrossOrigin: !isMainFrame && Boolean(mainOrigin) && Boolean(frameOrigin) && frameOrigin !== mainOrigin,
    isFrameVisible,
    ...frameElementMeta,
  };
}

async function collectFrameCandidates(frame, frameMeta) {
  return frame.evaluate(({ frameMetaPayload, maxCandidates }) => {
    function textOf(element) {
      return String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0;
    }

    function labelFor(element) {
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return textOf(label);
      }

      const wrappedLabel = element.closest('label');
      return wrappedLabel ? textOf(wrappedLabel) : '';
    }

    const elements = [...document.querySelectorAll('a,button,input,textarea,select,img,svg,[role],[aria-label],[data-testid],[data-test-id],[data-test],[data-qa],[data-cy],header,footer,nav,main,section')];

    return elements
      .filter(isVisible)
      .slice(0, maxCandidates)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const dataAttributes = {};
        for (const attr of ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy']) {
          const value = element.getAttribute(attr);
          if (value) dataAttributes[attr] = value;
        }

        return {
          frameMeta: frameMetaPayload,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role') || '',
          text: textOf(element).slice(0, 140),
          ariaLabel: element.getAttribute('aria-label') || '',
          alt: element.getAttribute('alt') || '',
          title: element.getAttribute('title') || '',
          placeholder: element.getAttribute('placeholder') || '',
          name: element.getAttribute('name') || '',
          id: element.id || '',
          href: element.getAttribute('href') || '',
          parentHref: element.closest('a')?.getAttribute('href') || '',
          src: element.getAttribute('src') || '',
          inputType: element.getAttribute('type') || '',
          label: labelFor(element),
          classNames: [...element.classList],
          descendantTestIds: [...element.querySelectorAll('[data-testid]')]
            .map((child) => child.getAttribute('data-testid'))
            .filter(Boolean)
            .slice(0, 5),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          dataAttributes,
          visible: true,
          isSvg: element.tagName.toLowerCase() === 'svg',
          isShadowDom: element.getRootNode() instanceof ShadowRoot,
        };
      });
  }, { frameMetaPayload: frameMeta, maxCandidates: MAX_CANDIDATES });
}

async function scanPageSelectors({ url, limit = MAX_GENERIC_ELEMENTS }) {
  const normalizedUrl = normalizeUrl(url);
  const maxResults = Math.max(1, Math.min(Number(limit) || MAX_GENERIC_ELEMENTS, MAX_GENERIC_ELEMENTS));
  const warnings = [];
  let browser = null;
  let context = null;
  let page = null;

  try {
    browser = await launchChromium();
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();

    const response = await page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    if (!response || response.status() >= 400) {
      throw new Error(`Page failed to load. Status: ${response ? response.status() : 'no response'}`);
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const frames = page.frames();
    const mainOrigin = originOf(page.mainFrame().url() || normalizedUrl);
    const rawElements = [];

    for (const [frameIndex, frame] of frames.entries()) {
      if (isIgnoredFrameUrl(frame.url())) {
        continue;
      }

      const frameMeta = await buildFrameMeta(page, frame, frameIndex, mainOrigin);
      if (!frameMeta.isMainFrame && !frameMeta.isFrameVisible) {
        continue;
      }

      if (frameMeta.isCrossOrigin) {
        warnings.push('Some iframe content could not be scanned due to cross-origin restrictions');
        continue;
      }

      const remaining = maxResults - rawElements.length;
      if (remaining <= 0) {
        break;
      }

      const frameElements = await collectGenericFrameElements(frame, frameMeta, remaining).catch((error) => {
        warnings.push(frameMeta.isMainFrame
          ? `Main document could not be scanned: ${error.message}`
          : 'Some iframe content could not be scanned due to cross-origin restrictions');
        return [];
      });
      rawElements.push(...frameElements);
    }

    const selectors = [];
    const seen = new Set();

    for (const element of rawElements.slice(0, maxResults)) {
      const selected = await chooseGenericSelector(page, element);
      if (!selected.selector) {
        continue;
      }

      const frameSelector = buildFrameSelector(element.frameMeta);
      const isInsideIframe = Boolean(element.frameMeta && !element.frameMeta.isMainFrame);
      const elementType = normalizeElementType(element);
      const elementName = genericElementName(element);
      const key = [
        element.frameMeta?.frameIndex ?? 0,
        element.tagName,
        selected.selector,
        element.text,
        element.label,
        element.href,
        element.placeholder,
      ].join('|');

      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      selectors.push({
        elementName,
        element: elementName,
        tagName: element.tagName,
        tag: element.tagName,
        elementType,
        text: element.text || '',
        label: element.label || '',
        placeholder: element.placeholder || '',
        href: element.href || '',
        role: element.role || inferRole(element) || '',
        section: element.section || 'unknown',
        selectorType: selected.selectorType,
        selector: selected.selector,
        locatorSelector: selected.selector,
        primarySelector: selected.selector,
        fallbackSelector: '',
        allSelectors: selected.allSelectors || [],
        matchCount: selected.matchCount,
        isStrict: selected.strict,
        id: element.id || '',
        name: element.name || '',
        ariaLabel: element.ariaLabel || '',
        alt: element.alt || '',
        title: element.title || '',
        className: (element.classNames || []).join(' '),
        dataTestId: element.dataAttributes?.['data-testid'] || '',
        dataAttributes: element.dataAttributes || {},
        isInsideIframe,
        iframeIndex: isInsideIframe ? element.frameMeta.frameIndex : null,
        iframeSelector: isInsideIframe ? frameSelector.frameLocator || '' : '',
        context: isInsideIframe ? frameSelector.context : element.section || 'main document',
        rect: element.rect,
      });
    }

    if (rawElements.length >= maxResults) {
      warnings.push(`Selector scan reached the ${maxResults} element limit. Use search or filters to narrow results.`);
    }

    return {
      url: normalizedUrl,
      selectors,
      warnings: [...new Set(warnings)],
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function inspectSelectors({ url, element }) {
  const normalizedUrl = normalizeUrl(url);
  const elementName = normalizeText(element);

  if (!elementName) {
    throw new Error('`element` is required');
  }

  let browser = null;
  let context = null;
  let page = null;

  try {
    browser = await launchChromium();
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();

    const response = await page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    if (!response || response.status() >= 400) {
      throw new Error(`Page failed to load. Status: ${response ? response.status() : 'no response'}`);
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const profile = getPurposeProfile(elementName);
    const allCandidates = [];
    const frames = page.frames();
    const mainOrigin = originOf(page.mainFrame().url() || normalizedUrl);
    const inaccessibleFrames = [];

    for (const [frameIndex, frame] of frames.entries()) {
      if (isIgnoredFrameUrl(frame.url())) {
        continue;
      }

      const isMainFrame = frame === page.mainFrame();
      let frameElementMeta = {};

      if (!isMainFrame) {
        const frameElement = await frame.frameElement().catch(() => null);
        if (frameElement) {
          frameElementMeta = await frameElement.evaluate((iframe) => ({
            id: iframe.id || '',
            name: iframe.getAttribute('name') || '',
            title: iframe.getAttribute('title') || '',
            src: iframe.getAttribute('src') || '',
          })).catch(() => ({}));
        }
      }

      const frameMeta = {
        isMainFrame,
        frameIndex,
        url: frame.url(),
        isCrossOrigin: !isMainFrame && Boolean(mainOrigin) && originOf(frame.url()) !== mainOrigin,
        ...frameElementMeta,
      };

      const frameCandidates = await collectFrameCandidates(frame, frameMeta).catch((error) => {
        inaccessibleFrames.push({
          frameIndex,
          url: frame.url(),
          isCrossOrigin: frameMeta.isCrossOrigin,
          message: error.message,
        });
        return [];
      });
      allCandidates.push(...frameCandidates);
    }

    const rankedCandidates = allCandidates
      .map((candidate) => ({
        ...candidate,
        matchScore: scoreCandidate(candidate, profile),
      }))
      .filter((candidate) => candidate.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 35);

    const verifiedSelectors = [];

    for (const candidate of rankedCandidates) {
      const selectors = buildCandidateSelectors(candidate, candidate.frameMeta)
        .map((selector) => ({
          ...selector,
          candidate,
          combinedScore: candidate.matchScore + selector.baseScore,
        }))
        .sort((a, b) => b.combinedScore - a.combinedScore);

      for (const selector of selectors) {
        const verified = await verifySelector(page, selector);
        if (verified.ok) {
          verifiedSelectors.push({
            ...selector,
            verified,
          });
        }
      }
    }

    const uniqueBySelector = [];
    const seen = new Set();
    for (const selector of verifiedSelectors.sort((a, b) => b.combinedScore - a.combinedScore)) {
      if (!seen.has(selector.selector)) {
        uniqueBySelector.push(selector);
        seen.add(selector.selector);
      }
    }

    if (!uniqueBySelector.length) {
      return {
        element: elementName,
        primarySelector: '',
        selectorType: 'none',
        stabilityScore: 1,
        reason: `No strict-mode-safe unique selector was found for "${elementName}". Add a stable data-testid such as data-testid="${toWords(elementName).join('-') || 'target-element'}".`,
        fallbackSelector: '',
        elementType: 'unknown',
        context: frames.length > 1 ? 'iframes detected' : 'main document',
        isInsideIframe: false,
        iframeSelector: '',
        iframeIndex: null,
        iframeMessage: inaccessibleFrames.some((frame) => frame.isCrossOrigin)
          ? 'Element appears inside cross-origin iframe. Use Playwright frame handling.'
          : '',
        visibilityCheck: '',
        alternatives: [],
      };
    }

    const [primary] = uniqueBySelector;
    const primaryCandidate = primary.candidate;
    const primaryFrameSelector = buildFrameSelector(primaryCandidate.frameMeta);
    const isInsideIframe = Boolean(primaryCandidate.frameMeta && !primaryCandidate.frameMeta.isMainFrame);
    const iframeMessage = isInsideIframe && primaryCandidate.frameMeta?.isCrossOrigin
      ? 'Element appears inside cross-origin iframe. Use Playwright frame handling.'
      : '';
    const primaryCandidateSelectors = uniqueBySelector.filter(
      (selector) => selector.candidate === primaryCandidate,
    );
    const relatedSelectors = uniqueBySelector.filter((selector) =>
      areRelatedCandidates(selector.candidate, primaryCandidate),
    );
    const helperFallbacks = buildHelperFallbacks(
      primaryCandidateSelectors.length ? primaryCandidateSelectors : uniqueBySelector,
    );
    const fallback = relatedSelectors.find((selector) => selector.selector !== primary.selector) ||
      uniqueBySelector.find((selector) => selector.selector !== primary.selector);
    const alternatives = (relatedSelectors.length > 1 ? relatedSelectors : uniqueBySelector)
      .filter((selector) => selector.selector !== primary.selector)
      .slice(0, 3);

    return {
      element: elementName,
      primarySelector: primary.selector,
      selectorType: primary.selectorType,
      stabilityScore: Math.max(1, Math.min(10, primary.baseScore + Math.floor(primary.candidate.matchScore / 12))),
      reason: `${primary.reason}. Selector was verified to resolve to exactly one visible element.`,
      fallbackSelector: fallback?.selector || '',
      elementType: primaryCandidate.tag.toUpperCase(),
      context: primary.context,
      isInsideIframe,
      iframeSelector: primaryFrameSelector.frameLocator || '',
      iframeIndex: isInsideIframe ? primaryCandidate.frameMeta.frameIndex : null,
      iframeMessage,
      isSvg: Boolean(primaryCandidate.isSvg),
      isShadowDom: Boolean(primaryCandidate.isShadowDom),
      visibilityCheck: `const locator = ${primary.selector};\nawait locator.waitFor({ state: 'visible', timeout: 5000 });`,
      locatorSelector: locatorSelectorFromFallbacks(helperFallbacks),
      selectorFallbacks: helperFallbacks,
      alternatives: alternatives.map((selector) => ({
        selector: selector.selector,
        selectorType: selector.selectorType,
        reason: selector.reason,
      })),
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { generateManualSelector, inspectSelectors, scanPageSelectors };
