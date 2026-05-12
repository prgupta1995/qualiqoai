import { Link } from 'react-router-dom'

function TestCaseCard({
  testCase,
  selectable = false,
  selected = false,
  onSelect,
  onDelete,
  deleting = false,
  generationResult,
}) {
  const runCount = testCase?._count?.testRuns ?? testCase.testRuns?.length ?? 0
  const bugCount = testCase?._count?.bugs ?? testCase.bugs?.length ?? 0
  const steps = Array.isArray(testCase.steps) ? testCase.steps : []
  const resultTone =
    generationResult?.status === 'generated'
      ? 'bg-emerald-50 text-emerald-700'
      : generationResult?.status === 'error'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-amber-50 text-amber-700'

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {selectable ? (
              <label className="mr-1 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onSelect?.(testCase.id, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Select
              </label>
            ) : null}
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              {testCase.priority || 'medium'} priority
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {testCase.status || 'active'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {testCase.script ? 'Script ready' : 'No script'}
            </span>
            {generationResult ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${resultTone}`}>
                {generationResult.status.replaceAll('_', ' ')}
              </span>
            ) : null}
          </div>
          <h3 className="mt-4 text-xl font-semibold text-slate-950">{testCase.title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            {testCase.description || 'No description provided for this test case yet.'}
          </p>
          <div className="mt-4 rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-blue-700">Preconditions</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {testCase.preconditions || 'No special preconditions defined.'}
            </p>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-gray-500">Expected Result</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {testCase.expectedResult || 'No expected result defined yet.'}
            </p>
          </div>
          {generationResult?.message ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-gray-500">Generation Status</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{generationResult.message}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <Link
            to={`/tests/${testCase.id}`}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            View Details
          </Link>
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(testCase.id)}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 overflow-hidden text-sm text-slate-600 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-gray-500">Steps</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{steps.length}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-gray-500">Runs</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{runCount}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-gray-500">Bugs</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{bugCount}</p>
        </div>
      </div>
    </article>
  )
}

export default TestCaseCard
