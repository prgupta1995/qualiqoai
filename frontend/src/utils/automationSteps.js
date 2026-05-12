export const actionOptions = [
  { value: '', label: 'Manual step' },
  { value: 'navigate', label: 'Navigate' },
  { value: 'click', label: 'Click' },
  { value: 'fill', label: 'Fill' },
  { value: 'select', label: 'Select' },
  { value: 'hover', label: 'Hover' },
  { value: 'check', label: 'Check' },
  { value: 'uncheck', label: 'Uncheck' },
  { value: 'press', label: 'Press' },
  { value: 'uploadFile', label: 'Upload File' },
]

export const assertionOptions = [
  { value: 'none', label: 'None' },
  { value: 'isVisible', label: 'Is Visible' },
  { value: 'isHidden', label: 'Is Hidden' },
  { value: 'isEnabled', label: 'Is Enabled' },
  { value: 'isDisabled', label: 'Is Disabled' },
  { value: 'isClickable', label: 'Is Clickable' },
  { value: 'hasText', label: 'Has Text' },
  { value: 'containsText', label: 'Contains Text' },
  { value: 'hasValue', label: 'Has Value' },
  { value: 'hasURL', label: 'Has URL' },
  { value: 'hasTitle', label: 'Has Title' },
  { value: 'hasAttribute', label: 'Has Attribute' },
  { value: 'hasCount', label: 'Has Count' },
]

const selectorActions = new Set([
  'click',
  'fill',
  'select',
  'hover',
  'check',
  'uncheck',
  'press',
  'uploadFile',
])

const valueActions = new Set(['navigate', 'fill', 'select', 'press', 'uploadFile'])
const expectedValueAssertions = new Set([
  'hasText',
  'containsText',
  'hasValue',
  'hasURL',
  'hasTitle',
  'hasAttribute',
  'hasCount',
])
const selectorAssertions = new Set([
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
])

export function createEmptyAutomationStep(overrides = {}) {
  return {
    description: '',
    action: '',
    selector: '',
    value: '',
    assertion: 'none',
    expectedValue: '',
    attributeName: '',
    selectorSource: '',
    ...overrides,
  }
}

export function normalizeAutomationStep(step) {
  if (typeof step === 'string') {
    return createEmptyAutomationStep({ description: step })
  }

  if (step && typeof step === 'object') {
    const selector = step.selector || step.selectorFinderSelector || ''
    const rawAction = String(step.action || step.type || '').trim()
    const isKnownAction = actionOptions.some((option) => option.value === rawAction)
    const description = step.description || step.text || (!isKnownAction ? rawAction : '') || step.expected || ''
    const action = isKnownAction ? rawAction : ''
    const rawAssertion = String(step.assertion || step.assertionType || '').trim()
    const assertion = assertionOptions.some((option) => option.value === rawAssertion)
      ? rawAssertion
      : 'none'

    return createEmptyAutomationStep({
      ...step,
      description,
      action,
      selector,
      value: step.value || step.actionValue || '',
      assertion,
      expectedValue: step.expectedValue || step.expectedResult || '',
      attributeName: step.attributeName || step.attribute || '',
      selectorSource: step.selectorSource || (selector ? 'manual' : ''),
    })
  }

  return createEmptyAutomationStep({ description: String(step || '') })
}

export function serializeAutomationStep(step) {
  const normalizedStep = normalizeAutomationStep(step)
  const description = String(normalizedStep.description || '').trim()
  const action = String(normalizedStep.action || '').trim()
  const selector = String(normalizedStep.selector || '').trim()
  const value = String(normalizedStep.value || '').trim()
  const assertion = String(normalizedStep.assertion || 'none').trim()
  const expectedValue = String(normalizedStep.expectedValue || '').trim()
  const attributeName = String(normalizedStep.attributeName || '').trim()

  if (!action && !selector && assertion === 'none' && !value && !expectedValue && !attributeName) {
    return description
  }

  return {
    description,
    ...(action && { action }),
    ...(selector && { selector, selectorFinderSelector: selector }),
    ...(value && { value }),
    assertion,
    ...(expectedValue && { expectedValue }),
    ...(attributeName && { attributeName }),
    ...(normalizedStep.selectorSource && { selectorSource: normalizedStep.selectorSource }),
  }
}

export function stepNeedsSelector(step) {
  const normalizedStep = normalizeAutomationStep(step)
  return selectorActions.has(normalizedStep.action) || selectorAssertions.has(normalizedStep.assertion)
}

export function stepNeedsActionValue(step) {
  return valueActions.has(normalizeAutomationStep(step).action)
}

export function stepNeedsExpectedValue(step) {
  return expectedValueAssertions.has(normalizeAutomationStep(step).assertion)
}

export function stepNeedsAttributeName(step) {
  return normalizeAutomationStep(step).assertion === 'hasAttribute'
}

export function validateAutomationSteps(steps) {
  const errors = []

  ;(Array.isArray(steps) ? steps : []).forEach((step, index) => {
    const normalizedStep = normalizeAutomationStep(step)
    const label = `Step ${index + 1}`

    if (!String(normalizedStep.description || '').trim()) {
      errors.push(`${label}: description is required.`)
    }

    if (stepNeedsSelector(normalizedStep) && !String(normalizedStep.selector || '').trim()) {
      errors.push(`${label}: selector is required for the selected action/assertion.`)
    }

    if (stepNeedsActionValue(normalizedStep) && !String(normalizedStep.value || '').trim()) {
      errors.push(`${label}: action value is required.`)
    }

    if (stepNeedsExpectedValue(normalizedStep) && !String(normalizedStep.expectedValue || '').trim()) {
      errors.push(`${label}: assertion expected value is required.`)
    }

    if (stepNeedsAttributeName(normalizedStep) && !String(normalizedStep.attributeName || '').trim()) {
      errors.push(`${label}: attribute name is required.`)
    }
  })

  return errors
}
