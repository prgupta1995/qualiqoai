import { Link } from 'react-router-dom'

function RunResultCard({ run }) {
  const isPassed = run.status === 'passed'
  const errorSummary = String(run.error || '').split('\n')[0].trim()

  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-md">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {run.status || 'unknown'}
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              {run.testCase?.title || 'Detached run'}
            </span>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Started {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'at an unknown time'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Execution time: {typeof run.duration === 'number' ? `${run.duration} ms` : 'N/A'}
          </p>
          {!isPassed && errorSummary ? (
            <p className="wrap-anywhere mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
              {errorSummary}
            </p>
          ) : null}
        </div>

        <Link
          to={`/runs/${run.id}`}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          View Run
        </Link>
      </div>
    </article>
  )
}

export default RunResultCard
