import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import {
  SELECTOR_FINDER_PAYLOAD_STORAGE_KEY,
  SELECTOR_FINDER_SELECTION_STORAGE_KEY,
  generateManualSelector,
  getTests,
  scanSelectors,
  updateTest,
} from '../services/api'
import {
  addSelectorToSteps,
  buildSelectorPayload,
  describeStep,
  selectorForTestStep,
} from '../utils/selectorStorage'

const SECTION_OPTIONS = ['all', 'header', 'nav', 'main', 'form', 'footer', 'unknown']
const ELEMENT_TYPE_OPTIONS = ['all', 'link', 'button', 'input', 'dropdown', 'image', 'text', 'other']
const MANUAL_ELEMENT_TYPES = ['button', 'link', 'input', 'dropdown', 'image', 'other']
const SELECTOR_TYPE_OPTIONS = [
  'all',
  'data-testid',
  'data-test',
  'data-test-id',
  'data-qa',
  'data-cy',
  'id',
  'href',
  'name',
  'placeholder',
  'aria-label',
  'label',
  'alt',
  'title',
  'role',
  'text',
  'css',
  'xpath',
]

function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase()
}

function getDisplayName(result = {}) {
  return result.elementName || result.element || result.text || result.label || result.placeholder || result.selector || 'Visible element'
}

function getElementType(result = {}) {
  return normalizeFilterValue(result.elementType || result.type || result.tagName || result.elementType)
}

function searchableValue(result = {}) {
  return [
    result.elementName,
    result.element,
    result.tagName,
    result.tag,
    result.text,
    result.label,
    result.placeholder,
    result.href,
    result.role,
    result.section,
    result.selectorType,
    result.selector,
    result.locatorSelector,
    result.primarySelector,
    result.id,
    result.name,
    result.className,
    result.dataTestId,
    result.alt,
    result.title,
    result.ariaLabel,
    ...Object.values(result.dataAttributes || {}),
  ].join(' ').toLowerCase()
}

function matchesSearch(result, query) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  const searchable = searchableValue(result)
  if (searchable.includes(normalizedQuery)) {
    return true
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  return terms.length > 1 && terms.every((term) => searchable.includes(term))
}

function SelectorFinder() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const finderState = location.state || {}
  const returnTo = searchParams.get('returnTo') || finderState.returnTo || ''
  const returnTestCaseId = searchParams.get('testCaseId') || finderState.testCaseId || ''
  const returnStepIndex = searchParams.get('stepIndex') ?? finderState.stepIndex ?? ''
  const [url, setUrl] = useState(finderState.url || '')
  const [results, setResults] = useState([])
  const [warnings, setWarnings] = useState([])
  const [hasScanned, setHasScanned] = useState(false)
  const [searchQuery, setSearchQuery] = useState(finderState.element || '')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [elementTypeFilter, setElementTypeFilter] = useState('all')
  const [selectorTypeFilter, setSelectorTypeFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [testCases, setTestCases] = useState([])
  const [testCasesLoading, setTestCasesLoading] = useState(false)
  const [insertModalOpen, setInsertModalOpen] = useState(false)
  const [pendingSelector, setPendingSelector] = useState(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualText, setManualText] = useState(finderState.element || '')
  const [manualLabel, setManualLabel] = useState('')
  const [manualPlaceholder, setManualPlaceholder] = useState('')
  const [manualElementType, setManualElementType] = useState('button')
  const [manualResult, setManualResult] = useState(null)
  const [manualLoading, setManualLoading] = useState(false)
  const [selectedTestCaseId, setSelectedTestCaseId] = useState('')
  const [selectedStepIndex, setSelectedStepIndex] = useState('new')
  const [selectedAction, setSelectedAction] = useState('assert')
  const [insertingSelector, setInsertingSelector] = useState(false)
  const [copiedSelector, setCopiedSelector] = useState('')
  const selectorTypeOptions = [
    ...new Set([
      ...SELECTOR_TYPE_OPTIONS,
      ...results.map((result) => normalizeFilterValue(result.selectorType)).filter(Boolean),
    ]),
  ]

  const filteredResults = results.filter((result) => {
    const query = searchQuery.trim().toLowerCase()
    const resultSection = normalizeFilterValue(result.section || result.context)
    const resultType = getElementType(result)
    const resultSelectorType = normalizeFilterValue(result.selectorType)

    if (query && !matchesSearch(result, query)) {
      return false
    }

    if (sectionFilter !== 'all' && resultSection !== sectionFilter) {
      return false
    }

    if (elementTypeFilter !== 'all' && resultType !== elementTypeFilter) {
      return false
    }

    return selectorTypeFilter === 'all' || resultSelectorType === selectorTypeFilter
  })

  const handleInspect = async (event) => {
    event.preventDefault()

    if (!url.trim()) {
      setError('Website URL is required.')
      return
    }

    try {
      setLoading(true)
      setError('')
      setStatusMessage('')
      setWarnings([])
      const response = await scanSelectors({ url })
      setResults(response.selectors || [])
      setWarnings(response.warnings || [])
      setHasScanned(true)
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setLoading(false)
    }
  }

  const copySelector = async (selector) => {
    const selectorValue = String(selector || '').trim()

    if (!selectorValue) {
      return
    }

    try {
      await navigator.clipboard.writeText(selectorValue)
      setCopiedSelector(selectorValue)
      setStatusMessage('Selector copied to clipboard.')
    } catch {
      setError('Could not copy selector. Select the selector text manually.')
    }
  }

  const loadTestCases = async () => {
    try {
      setTestCasesLoading(true)
      setError('')
      const response = await getTests()
      setTestCases(response.data || [])
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setTestCasesLoading(false)
    }
  }

  const saveSelectorForTestStep = (result) => {
    const payload = buildSelectorPayload(result, {
      action: selectedAction,
      testCaseId: returnTestCaseId,
      stepIndex: returnStepIndex,
    })

    if (!payload.selector) {
      setError('This selector cannot be attached as a clean step selector.')
      return
    }

    const storagePayload = {
      ...payload,
      elementName: payload.elementName || result.elementName || result.element,
      selectorSource: 'selector-finder',
      url,
      savedAt: new Date().toISOString(),
    }

    localStorage.setItem(SELECTOR_FINDER_SELECTION_STORAGE_KEY, JSON.stringify(storagePayload))

    if (returnTo === 'testcase' && returnTestCaseId) {
      localStorage.setItem(SELECTOR_FINDER_PAYLOAD_STORAGE_KEY, JSON.stringify(storagePayload))
      navigate(`/tests/${returnTestCaseId}`, {
        state: { message: 'Selector selected. Adding it to the test case step...' },
      })
      return
    }

    setPendingSelector(storagePayload)
    setSelectedTestCaseId('')
    setSelectedStepIndex('new')
    setSelectedAction(storagePayload.action || 'assert')
    setInsertModalOpen(true)
    setError('')
    if (!testCases.length) {
      void loadTestCases()
    }
  }

  const openManualFallback = () => {
    setManualText(searchQuery)
    setManualLabel('')
    setManualPlaceholder('')
    setManualElementType('button')
    setManualResult(null)
    setManualModalOpen(true)
    setError('')
  }

  const handleGenerateManualSelector = async (event) => {
    event.preventDefault()

    try {
      setManualLoading(true)
      setError('')
      const result = await generateManualSelector({
        text: manualText,
        label: manualLabel,
        placeholder: manualPlaceholder,
        elementType: manualElementType,
      })
      setManualResult({
        ...result,
        elementName: manualText || manualLabel || manualPlaceholder || 'Manual selector',
        text: manualText,
        label: manualLabel,
        placeholder: manualPlaceholder,
        tagName: manualElementType,
        elementType: manualElementType,
        section: 'unknown',
        selectorSource: 'manual-fallback',
      })
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setManualLoading(false)
    }
  }

  const selectedTestCase = testCases.find((testCase) => testCase.id === selectedTestCaseId)
  const selectedTestCaseSteps = Array.isArray(selectedTestCase?.steps) ? selectedTestCase.steps : []

  const handleInsertSelector = async (event) => {
    event.preventDefault()

    if (!pendingSelector?.selector) {
      setError('No selector selected.')
      return
    }

    if (!selectedTestCaseId) {
      setError('Choose a test case before inserting the selector.')
      return
    }

    try {
      setInsertingSelector(true)
      setError('')
      setStatusMessage('')
      const targetTestCase = testCases.find((testCase) => testCase.id === selectedTestCaseId)
      const updatedSteps = addSelectorToSteps(targetTestCase?.steps || [], {
        ...pendingSelector,
        action: selectedAction,
        testCaseId: selectedTestCaseId,
        stepIndex: selectedStepIndex,
      })
      const response = await updateTest(selectedTestCaseId, { steps: updatedSteps })

      setTestCases((current) =>
        current.map((testCase) =>
          testCase.id === selectedTestCaseId ? response.testCase || testCase : testCase,
        ),
      )
      setInsertModalOpen(false)
      setPendingSelector(null)
      setStatusMessage('Selector added to test case step.')
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setInsertingSelector(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Selector Finder</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-3xl">
          Discover selectors for any website
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Enter a URL and Testtoria scans visible links, buttons, forms, fields, images, menus,
          headers, footers, and same-origin iframes. Search and filter the results to copy a stable
          selector or attach it to a test case step.
        </p>
      </section>

      {error ? <ErrorMessage message={error} /> : null}
      {warnings.length ? (
        <div className="grid gap-2">
          {warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      {statusMessage ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <form className="rounded-lg border border-slate-200 bg-white p-6 shadow-md" onSubmit={handleInspect}>
          <h2 className="text-xl font-semibold text-slate-950">Inspect Website</h2>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Website URL</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="https://www.example.com"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Scanning...' : 'Scan Visible Elements'}
            </button>
          </div>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Selector Results</h2>
              <p className="mt-1 text-sm text-gray-500">
                {results.length
                  ? `${filteredResults.length} of ${results.length} visible elements shown`
                  : 'Scan a URL to discover visible elements.'}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Search</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={!hasScanned}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Search by text, label, placeholder, href, id, class, data-testid..."
              />
            </label>

            <div className="grid gap-3 lg:grid-cols-3">
              <FilterSelect
                label="Section"
                value={sectionFilter}
                onChange={setSectionFilter}
                options={SECTION_OPTIONS}
              />
              <FilterSelect
                label="Element type"
                value={elementTypeFilter}
                onChange={setElementTypeFilter}
                options={ELEMENT_TYPE_OPTIONS}
              />
              <FilterSelect
                label="Selector type"
                value={selectorTypeFilter}
                onChange={setSelectorTypeFilter}
                options={selectorTypeOptions}
              />
            </div>
          </div>

          {loading ? <div className="mt-5"><Loader label="Scanning visible elements and verifying selectors..." /></div> : null}

          {!loading && !hasScanned ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-gray-500">
              No selector results yet.
            </div>
          ) : null}

          {!loading && hasScanned && !results.length ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">No selector found automatically</p>
              <p className="mt-2 text-sm text-gray-500">
                The scan did not find visible useful elements. You can create a fallback selector from known text, label, or placeholder.
              </p>
              <button
                type="button"
                onClick={openManualFallback}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Create Selector Manually
              </button>
            </div>
          ) : null}

          {!loading && results.length && !filteredResults.length ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">No selector found automatically</p>
              <p className="mt-2 text-sm text-gray-500">
                Try a broader search, clear filters, or create a fallback selector from text, label, or placeholder.
              </p>
              <button
                type="button"
                onClick={openManualFallback}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Create Selector Manually
              </button>
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {filteredResults.map((result, index) => {
              const selector = selectorForTestStep(result)
              const displayName = getDisplayName(result)
              const summaryItems = [
                ['Text', result.text],
                ['Label', result.label],
                ['Placeholder', result.placeholder],
                ['Href', result.href],
                ['Role', result.role],
              ].filter(([, value]) => String(value || '').trim())

              return (
              <article key={`${selector}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto] xl:items-start">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-950" title={displayName}>
                      {displayName}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{result.tagName || result.elementType || 'element'}</Badge>
                      <Badge>{result.section || 'unknown'}</Badge>
                      <Badge>{result.selectorType}</Badge>
                      {result.isStrict ? <Badge tone="success">Strict</Badge> : null}
                      {result.isInsideIframe ? <Badge tone="warning">Iframe</Badge> : null}
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      {summaryItems.length ? summaryItems.slice(0, 3).map(([label, value]) => (
                        <InlineMeta key={label} label={label} value={value} />
                      )) : (
                        <p className="text-sm text-slate-500">No visible text metadata.</p>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selector</p>
                      {result.matchCount ? (
                        <span className="text-xs font-medium text-slate-500">{result.matchCount} match{result.matchCount === 1 ? '' : 'es'}</span>
                      ) : null}
                    </div>
                    <code className="mt-2 block max-h-24 overflow-auto break-all rounded-md bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-900">
                      {selector || 'No selector available'}
                    </code>
                    {result.isInsideIframe ? (
                      <p className="mt-2 text-xs text-amber-700">
                        {result.iframeSelector ||
                          (result.iframeIndex !== null && result.iframeIndex !== undefined
                            ? `iframe index ${result.iframeIndex}`
                            : 'Detected inside iframe')}
                      </p>
                    ) : null}
                    {result.iframeMessage ? (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {result.iframeMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 xl:flex-col xl:justify-start">
                    <button
                      type="button"
                      onClick={() => copySelector(selector)}
                      disabled={!selector}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {copiedSelector === selector ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveSelectorForTestStep(result)}
                      disabled={!selector}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use
                    </button>
                  </div>
                </div>

                {summaryItems.length > 3 || result.id || result.name || result.className ? (
                  <details className="mt-3 rounded-lg bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Element details
                    </summary>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      {summaryItems.slice(3).map(([label, value]) => (
                        <InlineMeta key={label} label={label} value={value} />
                      ))}
                      <InlineMeta label="ID" value={result.id} />
                      <InlineMeta label="Name" value={result.name} />
                      <InlineMeta label="Class" value={result.className} />
                    </div>
                  </details>
                ) : null}

                {result.alternatives?.length ? (
                  <details className="mt-4 rounded-lg bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Alternative selectors
                    </summary>
                    <div className="mt-3 space-y-3">
                      {result.alternatives.map((alternative) => (
                        <SelectorBlock
                          key={alternative.selector}
                          label={`${alternative.selectorType}: ${alternative.reason}`}
                          value={alternative.selector}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
                {result.allSelectors?.length > 1 ? (
                  <details className="mt-4 rounded-lg bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Generated selector candidates
                    </summary>
                    <div className="mt-3 space-y-3">
                      {result.allSelectors.slice(0, 8).map((candidate) => (
                        <SelectorBlock
                          key={`${candidate.selectorType}-${candidate.selector}`}
                          label={candidate.selectorType}
                          value={candidate.selector}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>
              )
            })}
          </div>
        </section>
      </section>

      {manualModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <form
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
            onSubmit={handleGenerateManualSelector}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Manual fallback</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Create selector from text, label, or placeholder
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Element text</span>
                <input
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  placeholder="Add to cart"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Label</span>
                  <input
                    value={manualLabel}
                    onChange={(event) => setManualLabel(event.target.value)}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                    placeholder="Email"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Placeholder</span>
                  <input
                    value={manualPlaceholder}
                    onChange={(event) => setManualPlaceholder(event.target.value)}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                    placeholder="Enter your email"
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Element type</span>
                <select
                  value={manualElementType}
                  onChange={(event) => setManualElementType(event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-3 capitalize outline-none transition focus:border-blue-500"
                >
                  {MANUAL_ELEMENT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={manualLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {manualLoading ? 'Generating...' : 'Generate Selector'}
              </button>
            </div>

            {manualResult ? (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <SelectorBlock label="Generated Selector" value={selectorForTestStep(manualResult)} />
                {manualResult.allSelectors?.length > 1 ? (
                  <details className="mt-4 rounded-lg bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Manual selector candidates
                    </summary>
                    <div className="mt-3 space-y-3">
                      {manualResult.allSelectors.map((candidate) => (
                        <SelectorBlock
                          key={`${candidate.selectorType}-${candidate.selector}`}
                          label={candidate.selectorType}
                          value={candidate.selector}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copySelector(selectorForTestStep(manualResult))}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Copy Selector
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualModalOpen(false)
                      saveSelectorForTestStep(manualResult)
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Use in Test Case Step
                  </button>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}

      {insertModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <form
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
            onSubmit={handleInsertSelector}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Insert Selector</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Add selector to a test case step
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInsertModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-lg bg-slate-950 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Selected selector
              </p>
              <code className="mt-2 block break-all text-sm text-slate-100">
                {pendingSelector?.selector}
              </code>
            </div>

            {testCasesLoading ? <div className="mt-5"><Loader label="Loading test cases..." /></div> : null}

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Test Case</span>
                <select
                  required
                  value={selectedTestCaseId}
                  onChange={(event) => {
                    setSelectedTestCaseId(event.target.value)
                    setSelectedStepIndex('new')
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                >
                  <option value="">Choose test case</option>
                  {testCases.map((testCase) => (
                    <option key={testCase.id} value={testCase.id}>
                      {testCase.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Step</span>
                  <select
                    value={selectedStepIndex}
                    onChange={(event) => setSelectedStepIndex(event.target.value)}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  >
                    <option value="new">Create new step</option>
                    {selectedTestCaseSteps.map((step, index) => (
                      <option key={`step-${index}`} value={String(index)}>
                        Step {index + 1}: {describeStep(step).slice(0, 80)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Action</span>
                  <select
                    value={selectedAction}
                    onChange={(event) => setSelectedAction(event.target.value)}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  >
                    <option value="assert">Assert</option>
                    <option value="click">Click</option>
                    <option value="fill">Fill</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setInsertModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={insertingSelector || !pendingSelector?.selector || !selectedTestCaseId}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {insertingSelector ? 'Adding...' : 'Add Selector'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function SelectorBlock({ label, value }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100">
        <code>{value}</code>
      </pre>
    </div>
  )
}

function Badge({ children, tone = 'neutral' }) {
  const toneClasses = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  }

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneClasses[tone] || toneClasses.neutral}`}>
      {children}
    </span>
  )
}

function InlineMeta({ label, value }) {
  if (!String(value || '').trim()) {
    return null
  }

  return (
    <div className="min-w-0">
      <span className="font-medium text-slate-500">{label}: </span>
      <span className="break-words text-slate-800">{value}</span>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-200 px-4 py-3 capitalize outline-none transition focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? 'All' : option}
          </option>
        ))}
      </select>
    </label>
  )
}

export default SelectorFinder
