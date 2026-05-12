const VALID_ARIA_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'option',
  'heading',
  'img',
  'navigation',
  'dialog',
  'table',
  'row',
  'cell',
  'searchbox',
  'menu',
  'listbox',
  'tab',
  'tabpanel',
]);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cssString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
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

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    if (!candidate || !candidate.type) {
      continue;
    }

    const signature = candidate.type === 'role'
      ? `role:${candidate.role}:${candidate.name || ''}`
      : `${candidate.type}:${candidate.value || ''}`;

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    unique.push(candidate);
  }

  return unique;
}

function pushRoleCandidate(candidates, role, name) {
  const normalizedRole = normalizeText(role).toLowerCase();
  const normalizedName = normalizeText(name);

  if (!VALID_ARIA_ROLES.has(normalizedRole) || !normalizedName) {
    return;
  }

  candidates.push({
    type: 'role',
    role: normalizedRole,
    name: normalizedName,
    value: normalizedName,
  });
}

function buildUniversalSelectorCandidates(intent = {}) {
  const elementType = normalizeText(intent.elementType).toLowerCase();
  const label = normalizeText(intent.label || intent.value || intent.text);
  const name = normalizeText(intent.name);
  const href = normalizeText(intent.href);
  const src = normalizeText(intent.src);
  const alt = normalizeText(intent.alt || intent.label);
  const placeholder = normalizeText(intent.placeholder || intent.label);
  const testId = normalizeText(intent.testId || intent.testid || intent.dataTestId);
  const id = normalizeText(intent.id);
  const className = normalizeText(intent.className);
  const candidates = [];

  if (testId) {
    candidates.push({ type: 'testid', value: testId });
    candidates.push({ type: 'css', value: `[data-testid="${cssString(testId)}"]` });
    candidates.push({ type: 'css', value: `[data-test="${cssString(testId)}"]` });
    candidates.push({ type: 'css', value: `[data-qa="${cssString(testId)}"]` });
  }

  if (id) {
    candidates.push({ type: 'css', value: `#${cssString(id)}` });
  }

  if (name) {
    const tag = ['button', 'input', 'select', 'textarea'].includes(elementType) ? elementType : '';
    candidates.push({ type: 'css', value: `${tag || '[name]'}[name="${cssString(name)}"]` });
  }

  if (placeholder && ['input', 'textbox', 'searchbox', 'textarea'].includes(elementType)) {
    candidates.push({ type: 'placeholder', value: placeholder });
  }

  if (intent.ariaLabel || label) {
    candidates.push({ type: 'css', value: `[aria-label="${cssString(intent.ariaLabel || label)}"]` });
  }

  if (elementType === 'button') {
    if (label) {
      pushRoleCandidate(candidates, 'button', label);
    }
    if (href) {
      candidates.push({ type: 'css', value: `a[href="${cssString(href)}"]` });
      candidates.push({ type: 'css', value: `a[href*="${cssString(href.replace(/^https?:\/\/[^/]+/i, ''))}"]` });
      if (label) pushRoleCandidate(candidates, 'link', label);
    }
    candidates.push({ type: 'css', value: 'button[type="submit"]' });
    candidates.push({ type: 'css', value: 'input[type="submit"]' });
  }

  if (['input', 'textbox', 'searchbox'].includes(elementType)) {
    if (label) {
      candidates.push({ type: 'label', value: label });
      pushRoleCandidate(candidates, elementType === 'searchbox' ? 'searchbox' : 'textbox', label);
    }
    if (name) candidates.push({ type: 'css', value: `input[name="${cssString(name)}"]` });
    if (intent.inputType) candidates.push({ type: 'css', value: `input[type="${cssString(intent.inputType)}"]` });
  }

  if (elementType === 'link') {
    if (href) {
      candidates.push({ type: 'css', value: `a[href="${cssString(href)}"]` });
      candidates.push({ type: 'css', value: `a[href*="${cssString(href.replace(/^https?:\/\/[^/]+/i, ''))}"]` });
    }
    if (label) {
      pushRoleCandidate(candidates, 'link', label);
    }
  }

  if (['image', 'img', 'logo'].includes(elementType)) {
    if (alt) candidates.push({ type: 'css', value: `img[alt*="${cssString(alt)}" i]` });
    if (src) candidates.push({ type: 'css', value: `img[src*="${cssString(src)}"]` });
    if (label) {
      candidates.push({ type: 'css', value: `[class*="${cssString(label)}" i]` });
      candidates.push({ type: 'css', value: `[aria-label*="${cssString(label)}" i]` });
    }
    candidates.push({ type: 'css', value: 'a[href="/"] img' });
  }

  if (className) {
    candidates.push({ type: 'css', value: `.${cssString(className)}` });
  }

  if (label) {
    candidates.push({ type: 'text', value: label });
  }

  if (elementType === 'button' && label) {
    candidates.push({
      type: 'xpath',
      value: `//*[self::button or self::input][contains(normalize-space(), ${xpathString(label)}) or contains(@value, ${xpathString(label)})]`,
    });
  } else if (['input', 'textbox', 'searchbox'].includes(elementType) && (name || placeholder || label)) {
    candidates.push({
      type: 'xpath',
      value: `//input[contains(@name, ${xpathString(name || label)}) or contains(@placeholder, ${xpathString(placeholder || label)})]`,
    });
  } else if (elementType === 'link' && (label || href)) {
    candidates.push({
      type: 'xpath',
      value: `//a[contains(normalize-space(), ${xpathString(label || href)}) or contains(@href, ${xpathString(href || label)})]`,
    });
  } else if (['image', 'img', 'logo'].includes(elementType)) {
    candidates.push({
      type: 'xpath',
      value: "//*[contains(translate(@alt,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'logo') or contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'logo')]",
    });
  } else if (label) {
    candidates.push({
      type: 'xpath',
      value: `//*[contains(normalize-space(), ${xpathString(label)})]`,
    });
  }

  return uniqueCandidates(candidates);
}

module.exports = {
  VALID_ARIA_ROLES,
  buildUniversalSelectorCandidates,
  uniqueCandidates,
};
