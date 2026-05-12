import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import {
  createTest,
  generateScriptFromRecording,
  runTest,
} from '../services/api'

const actionOptions = [
  { value: 'goto', label: 'goto' },
  { value: 'click', label: 'click' },
  { value: 'fill', label: 'fill' },
  { value: 'select', label: 'select' },
  { value: 'submit', label: 'submit' },
  { value: 'assert', label: 'assert' },
]

const initialAction = {
  type: 'goto',
  selector: '',
  value: '',
  text: '',
  url: '',
}

function buildActionSummary(action) {
  switch (action.type) {
    case 'goto':
      return `Navigate to ${action.url || 'the target URL'}`
    case 'click':
      return `Click ${action.selector || 'target selector'}`
    case 'fill':
      return `Fill ${action.selector || 'target field'} with ${action.value || 'value'}`
    case 'select':
      return `Select ${action.value || 'option'} from ${action.selector || 'target dropdown'}`
    case 'submit':
      return `Submit using ${action.selector || 'the current form action'}`
    case 'assert':
      return `Assert ${action.selector || 'target selector'} contains ${action.text || 'expected text'}`
    default:
      return action.type
  }
}

function buildExpectedResult(actions) {
  const assertionAction = [...actions].reverse().find((action) => action.type === 'assert')
  if (assertionAction?.text) {
    return assertionAction.text
  }

  return 'Recorded flow completes successfully.'
}

function RecordTest() {
  const [title, setTitle] = useState('')
  const [startUrl, setStartUrl] = useState('')
  const [draftAction, setDraftAction] = useState(initialAction)
  const [actions, setActions] = useState([])
  const [editingIndex, setEditingIndex] = useState(-1)
  const [generatedScript, setGeneratedScript] = useState('')
  const [savedTestCase, setSavedTestCase] = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  const actionRows = useMemo(
    () =>
      actions.map((action, index) => ({
        ...action,
        index,
        summary: buildActionSummary(action),
      })),
    [actions],
  )

  const resetDraft = () => {
    setDraftAction(initialAction)
    setEditingIndex(-1)
  }

  const handleAddAction = () => {
    if (draftAction.type === 'goto' && !draftAction.url.trim()) {
      setError('A goto action requires a URL.')
      return
    }

    if (['click', 'fill', 'select', 'submit', 'assert'].includes(draftAction.type) && !draftAction.selector.trim()) {
      setError('This action requires a selector.')
      return
    }

    if (['fill', 'select'].includes(draftAction.type) && !draftAction.value.trim()) {
      setError('This action requires a value.')
      return
    }

    if (draftAction.type === 'assert' && !draftAction.text.trim()) {
      setError('An assert action requires expected text.')
      return
    }

    setError('')
    const nextAction = {
      type: draftAction.type,
      selector: draftAction.selector.trim(),
      value: draftAction.value.trim(),
      text: draftAction.text.trim(),
      url: draftAction.url.trim(),
    }

    setActions((current) => {
      if (editingIndex >= 0) {
        return current.map((action, index) => (index === editingIndex ? nextAction : action))
      }

      return [...current, nextAction]
    })
    resetDraft()
  }

  const handleEditAction = (index) => {
    setDraftAction(actions[index])
    setEditingIndex(index)
    setError('')
  }

  const handleDeleteAction = (index) => {
    setActions((current) => current.filter((_, currentIndex) => currentIndex !== index))
    if (editingIndex === index) {
      resetDraft()
    }
  }

  const handleMoveAction = (index, direction) => {
    setActions((current) => {
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const reordered = [...current]
      const [item] = reordered.splice(index, 1)
      reordered.splice(nextIndex, 0, item)
      return reordered
    })
  }

  const ensureScriptGenerated = async () => {
    const response = await generateScriptFromRecording({
      title,
      startUrl,
      actions,
    })
    setGeneratedScript(response.script || '')
    return response.script || ''
  }

  const handleGenerateScript = async () => {
    if (!title.trim()) {
      setError('Test title is required.')
      return
    }

    if (!startUrl.trim()) {
      setError('Start URL is required.')
      return
    }

    if (!actions.length) {
      setError('Add at least one action before generating a script.')
      return
    }

    try {
      setBusyAction('generate')
      setError('')
      setRunResult(null)
      await ensureScriptGenerated()
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

  const saveRecordedTestCase = async (scriptOverride) => {
    const scriptToSave = scriptOverride || generatedScript

    if (!scriptToSave.trim()) {
      throw new Error('Generate a script before saving the recorded test case.')
    }

    const response = await createTest({
      title,
      url: startUrl,
      description: 'Generated from manual recorded actions',
      steps: actions,
      expectedResult: buildExpectedResult(actions),
      script: scriptToSave,
    })

    setSavedTestCase(response)
    return response
  }

  const handleSaveTestCase = async () => {
    try {
      setBusyAction('save')
      setError('')
      const ensuredScript = generatedScript.trim() ? generatedScript : await ensureScriptGenerated()
      await saveRecordedTestCase(ensuredScript)
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

  const handleSaveAndRun = async () => {
    try {
      setBusyAction('saveRun')
      setError('')
      const ensuredScript = generatedScript.trim() ? generatedScript : await ensureScriptGenerated()
      const testCase = await saveRecordedTestCase(ensuredScript)
      const runResponse = await runTest(testCase.id)
      setRunResult(runResponse.testRun || null)
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

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Manual Action Recorder</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-3xl">
          Record a test flow and let AI turn it into Playwright
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Build a manual sequence of browser actions, generate a Playwright script, save it as a
          test case, and optionally run it immediately.
        </p>
      </section>

      {error ? <ErrorMessage message={error} /> : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Recording Setup</h2>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Test Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Login flow smoke test"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Start URL</span>
              <input
                value={startUrl}
                onChange={(event) => setStartUrl(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="https://app.example.com/login"
              />
            </label>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
              AI script generation uses your browser-stored Testtoria API key and the local Ollama
              model by default. Manage keys from Settings → API Keys.
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Action Builder</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Action Type</span>
              <select
                value={draftAction.type}
                onChange={(event) => setDraftAction({ ...draftAction, type: event.target.value })}
                className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              >
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Selector</span>
              <input
                value={draftAction.selector}
                onChange={(event) =>
                  setDraftAction({ ...draftAction, selector: event.target.value })
                }
                className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder='[data-testid="email"]'
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Value</span>
              <input
                value={draftAction.value}
                onChange={(event) => setDraftAction({ ...draftAction, value: event.target.value })}
                className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="value or option"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Text / URL</span>
              <input
                value={draftAction.type === 'goto' ? draftAction.url : draftAction.text}
                onChange={(event) =>
                  setDraftAction(
                    draftAction.type === 'goto'
                      ? { ...draftAction, url: event.target.value }
                      : { ...draftAction, text: event.target.value },
                  )
                }
                className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder={draftAction.type === 'goto' ? 'https://example.com' : 'expected text'}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAddAction}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {editingIndex >= 0 ? 'Update Action' : 'Add Action'}
            </button>
            {editingIndex >= 0 ? (
              <button
                type="button"
                onClick={resetDraft}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Recorded Actions</h2>
            <p className="mt-1 text-sm text-gray-500">
              Arrange the manual browser actions in the order they should execute.
            </p>
          </div>
        </div>

        {!actionRows.length ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-gray-500">
            No actions added yet
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid grid-cols-[70px_130px_1fr_160px_180px_210px] gap-3 rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-600">
                <span>Order</span>
                <span>Type</span>
                <span>Summary</span>
                <span>Selector</span>
                <span>Value / Text</span>
                <span>Actions</span>
              </div>
              <div className="mt-3 space-y-3">
                {actionRows.map((action) => (
                  <div
                    key={`${action.type}-${action.index}`}
                    className="grid grid-cols-[70px_130px_1fr_160px_180px_210px] gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                  >
                    <span className="font-semibold text-slate-900">{action.index + 1}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                      {action.type}
                    </span>
                    <span>{action.summary}</span>
                    <span className="break-all">{action.selector || '-'}</span>
                    <span className="break-all">{action.value || action.text || action.url || '-'}</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleMoveAction(action.index, 'up')}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveAction(action.index, 'down')}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditAction(action.index)}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAction(action.index)}
                        className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={busyAction !== ''}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'generate' ? 'Generating script...' : 'Generate Script'}
          </button>
          <button
            type="button"
            onClick={handleSaveTestCase}
            disabled={busyAction !== ''}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'save' ? 'Saving test case...' : 'Save Test Case'}
          </button>
          <button
            type="button"
            onClick={handleSaveAndRun}
            disabled={busyAction !== ''}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'saveRun' ? 'Saving & running...' : 'Save & Run'}
          </button>
        </div>
      </section>

      {busyAction && busyAction !== 'saveRun' ? (
        <Loader
          label={
            busyAction === 'generate'
              ? 'Generating Playwright script...'
              : 'Saving recorded test case...'
          }
        />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Generated Playwright Script</h2>
            <p className="mt-1 text-sm text-gray-500">
              Review and edit the generated automation before saving.
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-xl bg-slate-950 p-4">
          <textarea
            value={generatedScript}
            onChange={(event) => setGeneratedScript(event.target.value)}
            className="min-h-[320px] w-full resize-y border-0 bg-transparent font-mono text-sm leading-7 text-slate-200 outline-none"
            placeholder="No script generated yet."
          />
        </div>
      </section>

      {savedTestCase ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-md">
          <h2 className="text-xl font-semibold text-emerald-900">Saved Test Case</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            {savedTestCase.title} has been saved from the manual recorder.
          </p>
          <div className="mt-4">
            <Link
              to={`/tests/${savedTestCase.id}`}
              className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Open Saved Test Case
            </Link>
          </div>
        </section>
      ) : null}

      {busyAction === 'saveRun' ? <Loader label="Saving test case and running automation..." /> : null}

      {runResult ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Latest Run Result</h2>
              <p className="mt-1 text-sm text-gray-500">
                Review the immediate outcome of the recorded automation.
              </p>
            </div>
            <span
              className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] ${
                runResult.status === 'passed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {runResult.status}
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-gray-500">Execution Time</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {typeof runResult.duration === 'number' ? `${runResult.duration} ms` : 'N/A'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-gray-500">Logs</p>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl bg-slate-950 p-4">
                  {Array.isArray(runResult.logs) && runResult.logs.length ? (
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                      {runResult.logs.join('\n')}
                    </pre>
                  ) : (
                    <p className="text-sm text-slate-400">No logs recorded.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-gray-500">Screenshot</p>
              {runResult.screenshot ? (
                <a href={runResult.screenshot} target="_blank" rel="noreferrer" className="mt-3 block">
                  <img
                    src={runResult.screenshot}
                    alt="Run screenshot"
                    className="h-72 w-full rounded-xl border border-slate-200 object-cover"
                    loading="lazy"
                  />
                </a>
              ) : (
                <p className="mt-3 text-sm text-gray-500">No screenshot available.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default RecordTest
