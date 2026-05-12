function cssString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function unescapeSelector(value) {
  return String(value || '')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim()
}

function getFirstQuotedArgument(value, methodName) {
  const expression = String(value || '').trim()
  const match = expression.match(
    new RegExp(`${methodName}\\(\\s*(['"\`])([\\s\\S]*?)\\1(?:\\s*,[\\s\\S]*?)?\\)`),
  )

  return match ? unescapeSelector(match[2]) : ''
}

export function normalizeSelectorForTestStep(value) {
  const rawValue = String(value || '').trim().replace(/;$/, '')

  if (!rawValue) {
    return ''
  }

  const locatorSelector = getFirstQuotedArgument(rawValue, 'page\\.locator')
  if (locatorSelector) {
    return locatorSelector
  }

  const testId = getFirstQuotedArgument(rawValue, 'page\\.getByTestId')
  if (testId) {
    return `[data-testid="${cssString(testId)}"]`
  }

  const placeholder = getFirstQuotedArgument(rawValue, 'page\\.getByPlaceholder')
  if (placeholder) {
    return `input[placeholder="${cssString(placeholder)}"], textarea[placeholder="${cssString(placeholder)}"]`
  }

  const altText = getFirstQuotedArgument(rawValue, 'page\\.getByAltText')
  if (altText) {
    return `img[alt="${cssString(altText)}"]`
  }

  const title = getFirstQuotedArgument(rawValue, 'page\\.getByTitle')
  if (title) {
    return `[title="${cssString(title)}"]`
  }

  const expressionSelector = rawValue.match(/page\.locator\(\s*(['"`])([\s\S]*?)\1\s*\)/)
  if (expressionSelector?.[2]) {
    return unescapeSelector(expressionSelector[2])
  }

  return rawValue
}

export function selectorForTestStep(source = {}) {
  const alternatives = Array.isArray(source.alternatives)
    ? source.alternatives.map((alternative) => alternative.selector)
    : []
  const candidates = [
    source.selector,
    source.locatorSelector,
    source.primarySelector,
    source.fallbackSelector,
    ...alternatives,
  ]

  for (const candidate of candidates) {
    const selector = normalizeSelectorForTestStep(candidate)

    if (selector) {
      return selector
    }
  }

  return ''
}

export function inferSelectorType(selector, selectorType = '') {
  const explicitType = String(selectorType || '').trim().toLowerCase()

  if (['css', 'xpath', 'text', 'testid'].includes(explicitType)) {
    return explicitType
  }

  const value = String(selector || '').trim()

  if (/^xpath=|^\/\//i.test(value)) {
    return 'xpath'
  }

  if (/\[data-test(?:id|-id)?=|\[data-qa=|\[data-cy=/i.test(value)) {
    return 'testid'
  }

  if (/^text=/i.test(value)) {
    return 'text'
  }

  return 'css'
}

export function buildSelectorPayload(source = {}, context = {}) {
  const selector = selectorForTestStep(source)

  return {
    selector,
    selectorType: inferSelectorType(selector, source.selectorType),
    elementName: source.element || source.elementName || context.elementName || '',
    action: context.action || source.action || 'assert',
    testCaseId: context.testCaseId || source.testCaseId || '',
    stepIndex: context.stepIndex ?? source.stepIndex ?? '',
  }
}

function readableAction({ action, elementName }) {
  const element = String(elementName || 'selected element').trim()

  if (action === 'click') {
    return `Click ${element}`
  }

  if (action === 'fill') {
    return `Fill ${element}`
  }

  return `Verify ${element} is visible`
}

export function describeStep(step) {
  if (typeof step === 'string') {
    return step || 'Untitled step'
  }

  if (step && typeof step === 'object') {
    return step.action || step.description || step.text || step.type || 'Untitled step'
  }

  return String(step || 'Untitled step')
}

export function addSelectorToStep(step, payload) {
  const selector = String(payload?.selector || '').trim()
  const selectorType = inferSelectorType(selector, payload?.selectorType)

  if (typeof step === 'string') {
    const baseStep = String(step || readableAction(payload))
      .replace(/\s+using selector:\s*.+$/i, '')
      .trim()

    return `${baseStep || readableAction(payload)} using selector: ${selector}`
  }

  if (step && typeof step === 'object') {
    const isAssertionOnly = payload?.action === 'assert'
    const nextStep = {
      ...step,
      selector,
      selectorFinderSelector: selector,
      selectorSource: 'selector-finder',
      selectorType,
      ...(isAssertionOnly && { assertion: step.assertion && step.assertion !== 'none' ? step.assertion : 'isVisible' }),
      ...(!isAssertionOnly && payload?.action && { action: payload.action }),
    }

    if (!nextStep.action && !nextStep.description) {
      nextStep.description = readableAction(payload)
    }

    return nextStep
  }

  return `${readableAction(payload)} using selector: ${selector}`
}

export function addSelectorToSteps(steps, payload) {
  const currentSteps = Array.isArray(steps) ? steps : []
  const shouldCreateStep = payload?.stepIndex === 'new' || payload?.stepIndex === ''
  const parsedIndex = Number(payload?.stepIndex)

  if (shouldCreateStep || Number.isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= currentSteps.length) {
    return [
      ...currentSteps,
      {
        ...(payload?.action && payload.action !== 'assert' && { action: payload.action }),
        assertion: payload?.action === 'assert' ? 'isVisible' : 'none',
        description: readableAction(payload),
        selector: payload.selector,
        selectorFinderSelector: payload.selector,
        selectorSource: 'selector-finder',
        selectorType: inferSelectorType(payload.selector, payload.selectorType),
      },
    ]
  }

  return currentSteps.map((step, index) =>
    index === parsedIndex ? addSelectorToStep(step, payload) : step,
  )
}
