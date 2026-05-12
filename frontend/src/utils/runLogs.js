export function formatDuration(duration) {
  if (typeof duration !== 'number') {
    return 'N/A'
  }

  if (duration >= 1000) {
    return `${(duration / 1000).toFixed(1)}s`
  }

  return `${duration}ms`
}

function splitTimestamp(log) {
  const raw = typeof log === 'string' ? log : JSON.stringify(log)
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/)

  return {
    raw,
    timestamp: match?.[1] || '',
    message: match?.[2] || raw,
  }
}

function classifyLog(message) {
  if (/Test failed|Reason:|Likely cause|Failed selector|Failed action|Timeout:|Script failed|FATAL/i.test(message)) {
    return { level: 'error', category: 'Failure' }
  }

  if (/completed successfully|Script completed/i.test(message)) {
    return { level: 'success', category: 'Result' }
  }

  if (/Running test:/i.test(message)) {
    return { level: 'info', category: 'Test' }
  }

  if (/Screenshot saved/i.test(message)) {
    return { level: 'info', category: 'Screenshot' }
  }

  if (/Network request failed|requestfailed|Suppressed .*network/i.test(message)) {
    return { level: 'warning', category: 'Network' }
  }

  if (/browser:|pageerror|console\./i.test(message)) {
    return { level: /error|pageerror/i.test(message) ? 'error' : 'warning', category: 'Browser' }
  }

  if (/Duration:/i.test(message)) {
    return { level: 'info', category: 'Timing' }
  }

  return { level: 'info', category: 'Execution' }
}

function friendlyMessage(message) {
  return String(message || '')
    .replace(/^Launching Chromium \(headless\)\.\.\.$/, 'Browser started in headless mode.')
    .replace(/^Executing test script\.\.\.$/, 'Test script started.')
    .replace(/^Browser closed$/, 'Browser closed.')
    .replace(/^📸\s*/, '')
    .replace(/^✅\s*/, '')
    .replace(/^❌\s*/, '')
    .replace(/^⚠️\s*/, '')
}

export function parseRunLogs(logs) {
  return (Array.isArray(logs) ? logs : []).map((log, index) => {
    const { raw, timestamp, message } = splitTimestamp(log)
    const classification = classifyLog(message)

    return {
      id: `${index}-${raw}`,
      raw,
      timestamp,
      message: friendlyMessage(message),
      ...classification,
    }
  })
}

function firstLine(value) {
  return String(value || '').split('\n')[0].trim()
}

function findFailedSelector(text) {
  const normalizedText = String(text || '')
  const locatorMatch = normalizedText.match(/waiting for locator\((['"`])([\s\S]*?)\1\)/)
  const failedSelectorMatch = normalizedText.match(/Failed selector:\s*([^\n]+)/i)
  const triedSelectorsMatch = normalizedText.match(/Tried selectors:\s*([^\n]+)/i)

  return locatorMatch?.[2] ||
    failedSelectorMatch?.[1]?.trim() ||
    triedSelectorsMatch?.[1]?.trim() ||
    ''
}

function findLogValue(entries, label) {
  const entry = entries.find((log) => log.message.toLowerCase().startsWith(label.toLowerCase()))
  return entry?.message.replace(new RegExp(`^${label}\\s*:?\\s*`, 'i'), '').trim() || ''
}

function inferLikelyCause(errorText, selector) {
  if (/Timeout .*waiting for locator|locator\.\w+:\s*Timeout/i.test(errorText)) {
    return 'The element did not appear, was hidden, or the selector no longer matches the page.'
  }

  if (/strict mode violation/i.test(errorText)) {
    return 'The selector matched multiple elements. Make it more specific.'
  }

  if (/toHaveText|toContainText|Assertion failed/i.test(errorText)) {
    return 'The page content did not match the expected assertion.'
  }

  if (/Page failed to load|net::ERR|status/i.test(errorText)) {
    return 'The page or a required request did not load correctly.'
  }

  if (selector) {
    return 'The failure is selector-related. Verify the selector against the screenshot.'
  }

  return 'Review the failed step, screenshot, and raw logs.'
}

export function buildFailureSummary(run, entries) {
  const rawText = [
    run?.error || '',
    ...entries.map((entry) => entry.raw),
  ].join('\n')
  const testName = entries
    .find((entry) => /^Running test:/i.test(entry.message))
    ?.message.replace(/^Running test:\s*/i, '')
  const reason = findLogValue(entries, 'Reason') || firstLine(run?.error) || 'No runtime error recorded.'
  const selector = findLogValue(entries, 'Failed selector') || findFailedSelector(rawText)
  const action = findLogValue(entries, 'Failed action')
  const timeout = findLogValue(entries, 'Timeout') || rawText.match(/Timeout\s+(\d+)ms/i)?.[0] || ''
  const likelyCause = findLogValue(entries, 'Likely cause') || inferLikelyCause(rawText, selector)

  return {
    testName,
    reason,
    selector,
    action,
    timeout,
    likelyCause,
    nextCheck: 'Open the screenshot, confirm the page state, then verify the selector/action for the failed step.',
  }
}

export function visibleTimelineEntries(entries) {
  const usefulCategories = new Set(['Execution', 'Test', 'Failure', 'Screenshot', 'Timing', 'Result', 'Network'])
  return entries.filter((entry) => usefulCategories.has(entry.category))
}
