import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import {
  SELECTOR_FINDER_PAYLOAD_STORAGE_KEY,
  SELECTOR_FINDER_SELECTION_STORAGE_KEY,
  getTests,
  inspectSelectors,
  updateTest,
} from '../services/api'
import {
  addSelectorToSteps,
  buildSelectorPayload,
  describeStep,
  selectorForTestStep,
} from '../utils/selectorStorage'

const commonElements = [
  'Homepage Logo',
  'Search Bar',
  'Login Button',
  'Cart Icon',
  'Main Menu',
  'Footer',
]

function SelectorFinder() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const finderState = location.state || {}
  const returnTo = searchParams.get('returnTo') || finderState.returnTo || ''
  const returnTestCaseId = searchParams.get('testCaseId') || finderState.testCaseId || ''
  const returnStepIndex = searchParams.get('stepIndex') ?? finderState.stepIndex ?? ''
  const [url, setUrl] = useState(finderState.url || 'https://www.tradelingstage.com/ae-en')
  const [elementsText, setElementsText] = useState(finderState.element || 'Homepage Logo')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [testCases, setTestCases] = useState([])
  const [testCasesLoading, setTestCasesLoading] = useState(false)
  const [insertModalOpen, setInsertModalOpen] = useState(false)
  const [pendingSelector, setPendingSelector] = useState(null)
  const [selectedTestCaseId, setSelectedTestCaseId] = useState('')
  const [selectedStepIndex, setSelectedStepIndex] = useState('new')
  const [selectedAction, setSelectedAction] = useState('assert')
  const [insertingSelector, setInsertingSelector] = useState(false)

  const elements = elementsText
    .split('\n')
    .map((element) => element.trim())
    .filter(Boolean)

  const handleInspect = async (event) => {
    event.preventDefault()

    if (!url.trim()) {
      setError('Website URL is required.')
      return
    }

    if (!elements.length) {
      setError('Add at least one element purpose.')
      return
    }

    try {
      setLoading(true)
      setError('')
      setStatusMessage('')
      const response = await inspectSelectors({ url, elements })
      setResults(response.selectors || [])
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

  const addCommonElement = (element) => {
    const current = new Set(elements)
    current.add(element)
    setElementsText([...current].join('\n'))
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

  useEffect(() => {
    if (insertModalOpen && !testCases.length) {
      void loadTestCases()
    }
  }, [insertModalOpen])

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
      elementName: payload.elementName || result.element,
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
          Generate strict Playwright selectors for any website
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Enter a URL and the element purpose. Testtoria opens the page with Playwright, inspects
          visible DOM candidates, rejects multi-match selectors, and returns strict-mode-safe
          locators with fallbacks.
        </p>
      </section>

      {error ? <ErrorMessage message={error} /> : null}
      {statusMessage ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
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

            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Element purposes, one per line</span>
              <textarea
                rows="8"
                value={elementsText}
                onChange={(event) => setElementsText(event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder={'Homepage Logo\nSearch Bar\nLogin Button'}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {commonElements.map((element) => (
                <button
                  key={element}
                  type="button"
                  onClick={() => addCommonElement(element)}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  {element}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Inspecting...' : 'Generate Selectors'}
            </button>
          </div>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Selector Results</h2>
          {loading ? <div className="mt-5"><Loader label="Opening website and verifying selectors..." /></div> : null}

          {!loading && !results.length ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-gray-500">
              No selector results yet.
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {results.map((result) => (
              <article key={result.element} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{result.element}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{result.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                      {result.selectorType}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Stability {result.stabilityScore}/10
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <SelectorBlock label="Clean Locator Selector" value={result.locatorSelector || 'No clean locator selector found'} />
                  <SelectorBlock label="Primary Selector" value={result.primarySelector || 'No stable selector found'} />
                  <SelectorBlock label="Fallback Selector" value={result.fallbackSelector || 'Add a stable data-testid for this element.'} />
                  <SelectorBlock label="Visibility Strategy" value={result.visibilityCheck || 'No visibility strategy available.'} />
                </div>

                <button
                  type="button"
                  onClick={() => saveSelectorForTestStep(result)}
                  disabled={!selectorForTestStep(result)}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Use in Test Case Step
                </button>

                <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-gray-500">Element Type</p>
                    <p className="mt-1 font-semibold text-slate-800">{result.elementType}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-gray-500">Context</p>
                    <p className="mt-1 font-semibold text-slate-800">{result.context}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-gray-500">Special DOM</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {result.isShadowDom ? 'Shadow DOM' : result.isSvg ? 'SVG' : 'Standard DOM'}
                    </p>
                  </div>
                </div>

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
              </article>
            ))}
          </div>
        </section>
      </section>

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

export default SelectorFinder
