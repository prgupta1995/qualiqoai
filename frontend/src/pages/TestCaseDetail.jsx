import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AutomationStepEditor from '../components/AutomationStepEditor'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import RunResultCard from '../components/RunResultCard'
import {
  SELECTOR_FINDER_PAYLOAD_STORAGE_KEY,
  SELECTOR_FINDER_SELECTION_STORAGE_KEY,
  deleteTest,
  getTestById,
  mapTestCasesToScripts,
  runTest,
  updateTest,
  updateTestScript,
} from '../services/api'
import {
  normalizeAutomationStep,
  serializeAutomationStep,
  validateAutomationSteps,
} from '../utils/automationSteps'
import { addSelectorToSteps, selectorForTestStep } from '../utils/selectorStorage'

const priorityOptions = ['low', 'medium', 'high', 'critical']
const typeOptions = ['Positive', 'Negative', 'Edge', 'Validation']

function normalizeEditableStep(step) {
  if (typeof step === 'string') {
    return {
      action: step,
      expectedResult: '',
      selector: '',
      selectorSource: '',
    }
  }

  if (step && typeof step === 'object') {
    const selector = step.selector || step.selectorFinderSelector || ''

    return {
      action: step.action || step.description || step.text || '',
      expectedResult: step.expectedResult || step.expected || '',
      selector,
      selectorSource: step.selectorSource || (selector ? 'manual' : ''),
    }
  }

  return {
    action: String(step || ''),
    expectedResult: '',
    selector: '',
    selectorSource: '',
  }
}

function serializeEditableStep(step) {
  const action = String(step?.action || '').trim()
  const expectedResult = String(step?.expectedResult || '').trim()
  const selector = String(step?.selector || '').trim()
  const selectorSource = ['selector-finder', 'manual', 'ai'].includes(step?.selectorSource)
    ? step.selectorSource
    : selector
      ? 'manual'
      : ''

  if (!selector && !expectedResult) {
    return action
  }

  return {
    action,
    ...(expectedResult && { expectedResult }),
    ...(selector && { selector }),
    ...(selector && { selectorFinderSelector: selector }),
    ...(selectorSource && { selectorSource }),
  }
}

function parseMetadata(tags = '') {
  const tagList = String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  return {
    type: tagList.find((tag) => tag.startsWith('type:'))?.replace('type:', '') || 'Positive',
    module: tagList.find((tag) => tag.startsWith('module:'))?.replace('module:', '') || 'General',
  }
}

function buildEditForm(testCase) {
  const metadata = parseMetadata(testCase?.tags)

  return {
    title: testCase?.title || '',
    description: testCase?.description || '',
    preconditions: testCase?.preconditions || '',
    url: testCase?.url || '',
    steps: Array.isArray(testCase?.steps) && testCase.steps.length
      ? testCase.steps.map(normalizeAutomationStep)
      : [normalizeAutomationStep('')],
    expectedResult: testCase?.expectedResult || '',
    priority: testCase?.priority || 'medium',
    type: typeOptions.includes(metadata.type) ? metadata.type : 'Positive',
    module: metadata.module || 'General',
  }
}

function renderStepContent(step) {
  if (typeof step === 'string') {
    return step
  }

  if (step && typeof step === 'object') {
    const parts = [step.description || step.text || step.action || step.type || 'action']

    if (step.action) parts.push(`action: ${step.action}`)
    if (step.selector) parts.push(`selector: ${step.selector}`)
    if (step.selectorSource) parts.push(`source: ${step.selectorSource}`)
    if (step.value) parts.push(`value: ${step.value}`)
    if (step.assertion && step.assertion !== 'none') parts.push(`assertion: ${step.assertion}`)
    if (step.attributeName) parts.push(`attribute: ${step.attributeName}`)
    if (step.expectedValue) parts.push(`expected: ${step.expectedValue}`)
    if (step.expectedResult) parts.push(`expected: ${step.expectedResult}`)
    if (step.url) parts.push(`url: ${step.url}`)

    return parts.join(' | ')
  }

  return String(step)
}

function TestCaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [testCase, setTestCase] = useState(null)
  const [editForm, setEditForm] = useState(buildEditForm(null))
  const [scriptDraft, setScriptDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isEditingTestCase, setIsEditingTestCase] = useState(false)
  const [isScriptExpanded, setIsScriptExpanded] = useState(true)
  const [scriptDirty, setScriptDirty] = useState(false)

  const syncStateFromTestCase = (response) => {
    setTestCase(response)
    setEditForm(buildEditForm(response))
    setScriptDraft(response?.script || '')
    setScriptDirty(false)
  }

  const loadTestCase = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await getTestById(id)
      syncStateFromTestCase(response)
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

  useEffect(() => {
    void loadTestCase()
  }, [id])

  useEffect(() => {
    if (!testCase?.id) {
      return
    }

    const rawPayload = localStorage.getItem(SELECTOR_FINDER_PAYLOAD_STORAGE_KEY)

    if (!rawPayload) {
      return
    }

    let payload
    try {
      payload = JSON.parse(rawPayload)
    } catch {
      localStorage.removeItem(SELECTOR_FINDER_PAYLOAD_STORAGE_KEY)
      setError('Saved selector payload is invalid. Please select the selector again.')
      return
    }

    if (String(payload.testCaseId || '') !== String(id)) {
      return
    }

    if (!payload.selector) {
      localStorage.removeItem(SELECTOR_FINDER_PAYLOAD_STORAGE_KEY)
      setError('No selector selected.')
      return
    }

    localStorage.removeItem(SELECTOR_FINDER_PAYLOAD_STORAGE_KEY)

    const insertSelector = async () => {
      try {
        setBusyAction('selector')
        setError('')
        setStatusMessage('')
        const updatedSteps = addSelectorToSteps(testCase.steps || [], payload)
        const response = await updateTest(id, { steps: updatedSteps })
        syncStateFromTestCase(response.testCase)
        setStatusMessage('Selector added to test case step.')
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            requestError.response?.data?.error ||
            requestError.message,
        )
      } finally {
        setBusyAction('')
      }
    }

    void insertSelector()
  }, [id, testCase?.id])

  const updateEditForm = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  const updateEditStep = (index, field, value) => {
    setEditForm((current) => ({
      ...current,
      steps: current.steps.map((step, currentIndex) =>
        currentIndex === index ? { ...step, [field]: value } : step,
      ),
    }))
  }

  const addEditStep = () => {
    setEditForm((current) => ({ ...current, steps: [...current.steps, normalizeEditableStep('')] }))
  }

  const removeEditStep = (index) => {
    setEditForm((current) => ({
      ...current,
      steps:
        current.steps.length > 1
          ? current.steps.filter((_, currentIndex) => currentIndex !== index)
          : [normalizeEditableStep('')],
    }))
  }

  const applySelectorFinderSelection = (index) => {
    const rawSelection = localStorage.getItem(SELECTOR_FINDER_SELECTION_STORAGE_KEY)

    if (!rawSelection) {
      setError('No Selector Finder selection is available. Generate a selector first, then click "Use in Test Case Step".')
      return
    }

    try {
      const selection = JSON.parse(rawSelection)

      const selector = selectorForTestStep(selection)

      if (!selector) {
        throw new Error('Saved selector is empty')
      }

      setEditForm((current) => ({
        ...current,
        url: current.url || selection.url || '',
        steps: current.steps.map((step, currentIndex) =>
          currentIndex === index
            ? {
                ...step,
                selector,
                selectorSource: 'selector-finder',
                action: step.action || `Verify ${selection.element || 'selected element'}`,
              }
            : step,
        ),
      }))
      setStatusMessage(`Attached Selector Finder selector to step ${index + 1}. Save changes to keep it.`)
      setError('')
    } catch {
      setError('Saved Selector Finder selection is invalid. Generate it again from Selector Finder.')
    }
  }

  const openSelectorFinderForStep = (index) => {
    const step = editForm.steps[index] || {}
    const params = new URLSearchParams({
      testCaseId: id,
      returnTo: 'testcase',
      stepIndex: String(index),
    })

    navigate(`/selector-finder?${params.toString()}`, {
      state: {
        url: editForm.url || testCase?.url || '',
        element: step.description || step.action || testCase?.title || 'Homepage Logo',
        testCaseId: id,
        returnTo: 'testcase',
        stepIndex: String(index),
      },
    })
  }

  const moveEditStep = (index, direction) => {
    setEditForm((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.steps.length) {
        return current
      }

      const nextSteps = [...current.steps]
      const [step] = nextSteps.splice(index, 1)
      nextSteps.splice(nextIndex, 0, step)
      return { ...current, steps: nextSteps }
    })
  }

  const saveTestCaseChanges = async (event) => {
    event.preventDefault()

    const validationErrors = validateAutomationSteps(editForm.steps)

    if (validationErrors.length) {
      setError(validationErrors[0])
      return
    }

    const steps = editForm.steps
      .map(serializeAutomationStep)
      .filter((step) =>
        typeof step === 'string'
          ? Boolean(step.trim())
          : Boolean(String(step.description || step.action || step.selector || step.assertion || '').trim()),
      )

    if (!editForm.title.trim()) {
      setError('Title is required.')
      return
    }

    if (!steps.length) {
      setError('At least one step is required.')
      return
    }

    try {
      setBusyAction('saveTest')
      setError('')
      setStatusMessage('')
      const response = await updateTest(id, {
        ...editForm,
        steps,
        generated_script: scriptDraft,
      })
      syncStateFromTestCase(response.testCase)
      setIsEditingTestCase(false)
      setStatusMessage(response.message || 'Test case updated successfully.')
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setBusyAction('')
    }
  }

  const cancelTestCaseEdit = () => {
    setEditForm(buildEditForm(testCase))
    setIsEditingTestCase(false)
    setError('')
  }

  const saveScript = async () => {
    if (!scriptDraft.trim()) {
      setError('Generated script is required before saving.')
      return null
    }

    try {
      setBusyAction('saveScript')
      setError('')
      setStatusMessage('')
      const response = await updateTestScript(id, scriptDraft)
      syncStateFromTestCase(response.testCase)
      setStatusMessage(response.message || 'Script updated successfully.')
      return response.testCase
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
      return null
    } finally {
      setBusyAction('')
    }
  }

  const handleGenerateScript = async () => {
    if ((scriptDirty || scriptDraft.trim()) && !window.confirm('This will replace your current script. Continue?')) {
      return false
    }

    try {
      setBusyAction('script')
      setError('')
      setStatusMessage('')
      const response = await mapTestCasesToScripts({
        testCaseIds: [id],
        overwriteExisting: true,
      })
      const generatedResult = (response.scripts || [])[0]

      if (generatedResult?.status === 'error') {
        throw new Error(generatedResult.message || 'Script generation failed')
      }

      await loadTestCase()
      setStatusMessage('Script generated. You can edit it before running.')
      return true
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
      return false
    } finally {
      setBusyAction('')
    }
  }

  const handleRunTest = async () => {
    try {
      setBusyAction('run')
      setError('')
      setStatusMessage('')

      if (scriptDirty) {
        const savedTestCase = await saveScript()
        if (!savedTestCase) {
          return
        }
      }

      if (!String(scriptDraft || testCase?.script || '').trim()) {
        setError('Generate or save a Playwright script before running this test.')
        return
      }

      const response = await runTest(id)
      await loadTestCase()
      if (response.testRun?.id) {
        navigate(`/runs/${response.testRun.id}`)
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setBusyAction('')
    }
  }

  const handleGenerateAndRun = async () => {
    const generated = await handleGenerateScript()

    if (!generated) {
      return
    }

    try {
      setBusyAction('generateRun')
      setError('')
      const response = await runTest(id)
      await loadTestCase()
      if (response.testRun?.id) {
        navigate(`/runs/${response.testRun.id}`)
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setBusyAction('')
    }
  }

  const handleDeleteTestCase = async () => {
    if (!window.confirm('Are you sure you want to delete this test case?')) {
      return
    }

    try {
      setBusyAction('delete')
      setError('')
      setStatusMessage('')
      const response = await deleteTest(id)
      navigate('/tests', {
        state: { message: response.message || 'Test case deleted successfully.' },
      })
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setBusyAction('')
    }
  }

  if (loading) {
    return <Loader label="Loading test case details..." />
  }

  if (error && !testCase) {
    return <ErrorMessage message={error} onRetry={loadTestCase} />
  }

  const steps = Array.isArray(testCase?.steps) ? testCase.steps : []
  const metadata = parseMetadata(testCase?.tags)

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link to="/tests" className="text-sm font-semibold text-blue-600">
              Back to Test Cases
            </Link>
            <h1 className="mt-3 text-xl font-semibold text-slate-950 sm:text-3xl">
              {testCase.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500">
              {testCase.description || 'No description supplied for this test case.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                {testCase.priority || 'medium'} priority
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {metadata.type}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {metadata.module}
              </span>
              {scriptDirty ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Unsaved script changes
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsEditingTestCase(true)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Edit Test Case
            </button>
            <button
              type="button"
              onClick={handleDeleteTestCase}
              disabled={busyAction !== ''}
              className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'delete' ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={handleGenerateScript}
              disabled={busyAction !== ''}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'script' ? 'Generating...' : 'Regenerate Script'}
            </button>
            <button
              type="button"
              onClick={handleGenerateAndRun}
              disabled={busyAction !== ''}
              className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'generateRun' ? 'Generating & running...' : 'Generate & Run'}
            </button>
            <button
              type="button"
              onClick={handleRunTest}
              disabled={busyAction !== ''}
              className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'run' ? 'Running...' : 'Run Script'}
            </button>
          </div>
        </div>
      </section>

      {error ? <ErrorMessage message={error} onRetry={loadTestCase} /> : null}
      {statusMessage ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </p>
      ) : null}

      {isEditingTestCase ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
          <form className="grid gap-4" onSubmit={saveTestCaseChanges}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-gray-500">Edit Mode</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Edit Test Case</h2>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={cancelTestCaseEdit}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'saveTest'}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {busyAction === 'saveTest' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Title</span>
              <input
                required
                value={editForm.title}
                onChange={(event) => updateEditForm('title', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Description</span>
              <textarea
                rows="3"
                value={editForm.description}
                onChange={(event) => updateEditForm('description', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Preconditions</span>
              <textarea
                rows="3"
                value={editForm.preconditions}
                onChange={(event) => updateEditForm('preconditions', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Application URL</span>
              <input
                value={editForm.url}
                onChange={(event) => updateEditForm('url', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="https://www.example.com"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Priority</span>
                <select
                  value={editForm.priority}
                  onChange={(event) => updateEditForm('priority', event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                >
                  {priorityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Type</span>
                <select
                  value={editForm.type}
                  onChange={(event) => updateEditForm('type', event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                >
                  {typeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Module</span>
                <input
                  value={editForm.module}
                  onChange={(event) => updateEditForm('module', event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                />
              </label>
            </div>
            <AutomationStepEditor
              steps={editForm.steps}
              onChange={(steps) => updateEditForm('steps', steps)}
              allowSelectorFinder
              onUseFinderSelector={openSelectorFinderForStep}
            />
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Expected Result</span>
              <textarea
                rows="3"
                value={editForm.expectedResult}
                onChange={(event) => updateEditForm('expectedResult', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </label>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Test Steps</h2>
          <div className="mt-5 space-y-3">
            {steps.length ? (
              steps.map((step, index) => (
                <div key={`step-${index}`} className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-gray-500">Step {index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{renderStepContent(step)}</p>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-gray-500">
                No steps were defined for this test case.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Preconditions</h2>
          <div className="mt-5 rounded-lg bg-blue-50 p-5">
            <p className="text-sm leading-6 text-slate-700">
              {testCase.preconditions || 'No special preconditions have been recorded yet.'}
            </p>
          </div>

          <h2 className="mt-6 text-xl font-semibold text-slate-950">Expected Result</h2>
          <div className="mt-5 rounded-lg bg-slate-50 p-5">
            <p className="text-sm leading-6 text-slate-700">
              {testCase.expectedResult || 'No expected result has been recorded yet.'}
            </p>
          </div>
        </article>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Generated Playwright Script</h2>
            <p className="mt-1 text-sm text-gray-500">
              Edit, save, and run the latest script stored for this test case.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {scriptDirty ? (
              <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Unsaved changes
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setIsScriptExpanded((current) => !current)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {isScriptExpanded ? 'Collapse' : 'Expand'}
            </button>
            <button
              type="button"
              onClick={saveScript}
              disabled={busyAction !== '' || !scriptDirty}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'saveScript' ? 'Saving...' : 'Save Script'}
            </button>
            <button
              type="button"
              onClick={handleRunTest}
              disabled={busyAction !== ''}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {busyAction === 'run' ? 'Running...' : 'Run Script'}
            </button>
          </div>
        </div>
        {isScriptExpanded ? (
          <textarea
            value={scriptDraft}
            onChange={(event) => {
              setScriptDraft(event.target.value)
              setScriptDirty(event.target.value !== (testCase.script || ''))
            }}
            rows="18"
            spellCheck="false"
            className="mt-5 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-4 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-blue-500"
            placeholder="Generate or paste a Playwright script here."
          />
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
        <h2 className="text-xl font-semibold text-slate-950">Recent Runs</h2>
        <div className="mt-5 space-y-4">
          {testCase.testRuns?.length ? (
            testCase.testRuns.map((run) => <RunResultCard key={run.id} run={run} />)
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-gray-500">
              No runs available yet for this scenario.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default TestCaseDetail
