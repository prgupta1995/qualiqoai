import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import { getRunById } from '../services/api'
import {
  buildFailureSummary,
  formatDuration,
  parseRunLogs,
  visibleTimelineEntries,
} from '../utils/runLogs'

function TestRunResults() {
  const { id } = useParams()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false)

  const loadRun = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await getRunById(id)
      setRun(response)
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initializeRun = async () => {
      try {
        const response = await getRunById(id)
        setRun(response)
      } catch (requestError) {
        setError(requestError.response?.data?.error || requestError.message)
      } finally {
        setLoading(false)
      }
    }

    initializeRun()
  }, [id])

  if (loading) {
    return <Loader label="Loading run result..." />
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadRun} />
  }

  const logs = Array.isArray(run.logs) ? run.logs : []
  const logEntries = parseRunLogs(logs)
  const timelineEntries = visibleTimelineEntries(logEntries)
  const failureSummary = buildFailureSummary(run, logEntries)
  const normalizedStatus = String(run.status || '').toLowerCase()
  const isPassed = ['pass', 'passed'].includes(normalizedStatus)
  const screenshotBorder = isPassed ? 'border-emerald-200' : 'border-rose-200'
  const screenshotBadge = isPassed
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700'

  return (
    <>
      <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link to={`/tests/${run.testCaseId}`} className="text-sm font-semibold text-teal-700">
              Back to Test Case
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {run.testCase?.title || 'Run Details'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Started {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'unknown'}
            </p>
          </div>
          <div
            className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
              isPassed
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {run.status}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Execution Summary</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <SummaryTile label="Execution Time" value={formatDuration(run.duration)} />
            <SummaryTile label="Test Name" value={failureSummary.testName || run.testCase?.title || 'Run details'} />
            <SummaryTile label="Screenshot" value={run.screenshot ? 'Available' : 'Not captured'} />
          </div>

          {!isPassed ? (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-700">
                Failure Breakdown
              </p>
              <dl className="mt-4 grid gap-4">
                <FailureField label="What failed" value={failureSummary.reason} />
                <FailureField label="Likely cause" value={failureSummary.likelyCause} />
                {failureSummary.action ? (
                  <FailureField label="Failed action" value={failureSummary.action} />
                ) : null}
                {failureSummary.selector ? (
                  <FailureField label="Failed selector" value={failureSummary.selector} mono />
                ) : null}
                {failureSummary.timeout ? (
                  <FailureField label="Timeout" value={failureSummary.timeout} />
                ) : null}
                <FailureField label="Next check" value={failureSummary.nextCheck} />
              </dl>
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              This run completed successfully.
            </p>
          )}

          <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Raw error details
            </summary>
            <pre className="log-pre-wrap mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100">
              {run.error || 'No runtime error recorded.'}
            </pre>
          </details>
        </article>

        <article className={`min-w-0 rounded-lg border ${screenshotBorder} bg-white p-6 shadow-sm`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Screenshot</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${screenshotBadge}`}>
              {isPassed ? 'Pass snapshot' : 'Fail snapshot'}
            </span>
          </div>
          {run.screenshot ? (
            <button
              type="button"
              onClick={() => setIsScreenshotOpen(true)}
              className="mt-5 block w-full text-left"
            >
              <img
                src={run.screenshot}
                alt="Run screenshot"
                loading="lazy"
                className={`max-h-[32rem] w-full rounded-lg border ${screenshotBorder} object-contain bg-slate-50 shadow-sm`}
              />
              <span className="mt-3 inline-flex rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                Open full screenshot
              </span>
            </button>
          ) : (
            <p className="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-500">
              No screenshot attached to this run.
            </p>
          )}
        </article>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Readable Timeline</h2>
        <div className="mt-5">
          {timelineEntries.length ? (
            <ul className="space-y-3">
              {timelineEntries.map((entry) => (
                <li key={entry.id} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${levelClass(entry.level)}`}>
                        {entry.category}
                      </span>
                      <p className="wrap-anywhere mt-2 text-sm leading-6 text-slate-700">
                        {entry.message}
                      </p>
                    </div>
                    {entry.timestamp ? (
                      <span className="text-xs text-slate-400">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-500">
              No readable log entries recorded for this execution.
            </p>
          )}
        </div>

        <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Raw logs
          </summary>
          <div className="mt-4 rounded-lg bg-slate-950 p-5">
            {logs.length ? (
              <pre className="log-pre-wrap max-h-96 overflow-auto text-sm leading-6 text-slate-200">
                {logs.map((log) => (typeof log === 'string' ? log : JSON.stringify(log))).join('\n')}
              </pre>
            ) : (
              <p className="text-sm text-slate-400">No logs recorded for this execution.</p>
            )}
          </div>
        </details>
      </section>
      </div>

      {isScreenshotOpen && run.screenshot ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
          <div className="w-full max-w-5xl rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Execution Snapshot</p>
                <h2 className="text-xl font-semibold text-slate-950">
                  {run.testCase?.title || 'Run Screenshot'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsScreenshotOpen(false)}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
            <a
              href={run.screenshot}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Open in new tab
            </a>
            <img
              src={run.screenshot}
              alt="Full run screenshot"
              loading="lazy"
              className={`mt-4 max-h-[75vh] w-full rounded-[1.5rem] border ${screenshotBorder} object-contain`}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

function SummaryTile({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="wrap-anywhere mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function FailureField({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
        {label}
      </dt>
      <dd className={`wrap-anywhere mt-1 text-sm leading-6 text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function levelClass(level) {
  if (level === 'error') {
    return 'bg-rose-100 text-rose-700'
  }

  if (level === 'warning') {
    return 'bg-amber-100 text-amber-700'
  }

  if (level === 'success') {
    return 'bg-emerald-100 text-emerald-700'
  }

  return 'bg-blue-100 text-blue-700'
}

export default TestRunResults
