import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import { getBugs } from '../services/api'

function Bugs() {
  const [bugs, setBugs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadBugs = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await getBugs()
      setBugs(response.data || [])
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
    const initializeBugs = async () => {
      try {
        const response = await getBugs()
        setBugs(response.data || [])
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

    initializeBugs()
  }, [])

  if (loading) {
    return <Loader label="Loading bug backlog..." />
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadBugs} />
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Failure Triage</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-3xl">
          Review bug evidence and linked runs
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Every bug card keeps the failing test context, run details, logs, and screenshot together.
        </p>
      </section>

      {bugs.length ? (
        <section className="grid gap-4">
          {bugs.map((bug) => (
            <article key={bug.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
                      {bug.status}
                    </span>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                      {bug.severity || 'medium'} severity
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-slate-950">{bug.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    {bug.description || 'No additional description recorded.'}
                  </p>
                </div>

                {bug.testRun?.id ? (
                  <Link
                    to={`/runs/${bug.testRun.id}`}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Open Run
                  </Link>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 p-5">
                    <p className="text-sm text-gray-500">Linked Test Case</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {bug.testCase?.title || 'Unknown test case'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-5">
                    <p className="text-sm text-gray-500">Notes / Logs</p>
                    <p className="mt-2 max-h-48 overflow-y-auto text-sm leading-6 text-slate-700">
                      {bug.notes || bug.testRun?.error || 'No notes captured for this bug.'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-sm text-gray-500">Screenshot</p>
                  {bug.testRun?.screenshot ? (
                    <img
                      src={bug.testRun.screenshot}
                      alt={bug.title}
                      className="mt-3 h-56 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">No screenshot available.</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">No bugs available</h2>
          <p className="mt-3 text-sm text-gray-500">
            Failures that create bug records will appear here automatically.
          </p>
        </section>
      )}
    </div>
  )
}

export default Bugs
