import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import RunResultCard from '../components/RunResultCard'
import api, { getRuns, getTests } from '../services/api'

function normalizeRunStatus(status) {
  if (!status) {
    return 'unknown'
  }

  const normalizedStatus = String(status).toLowerCase()

  if (['pass', 'passed'].includes(normalizedStatus)) {
    return 'pass'
  }

  if (['fail', 'failed', 'error'].includes(normalizedStatus)) {
    return 'fail'
  }

  return normalizedStatus
}

function computeSummaryFromData(testsResponse, runsResponse) {
  const tests = testsResponse?.data || []
  const runs = runsResponse?.data || []
  const passedRuns = runs.filter((run) => normalizeRunStatus(run.status) === 'pass').length
  const failedRuns = runs.filter((run) => normalizeRunStatus(run.status) === 'fail').length
  const totalRuns = runsResponse?.total ?? runs.length
  const totalTestCases = testsResponse?.total ?? tests.length
  const successRate = totalRuns ? Math.round((passedRuns / totalRuns) * 100) : 0

  return {
    totalTestCases,
    totalRuns,
    passedRuns,
    failedRuns,
    successRate,
  }
}

function Dashboard({ appName }) {
  const [summary, setSummary] = useState(null)
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dataMode, setDataMode] = useState('api')
  const [hasData, setHasData] = useState(true)

  const fetchDashboardSummary = async () => {
    setLoading(true)
    setError('')
    setHasData(true)

    try {
      const [summaryResponse, runResponse] = await Promise.all([
        api.get('/api/dashboard/summary'),
        getRuns({ limit: 3 }),
      ])

      const backendSummary = summaryResponse.data || {}
      const totalRuns = backendSummary.totalRuns ?? 0
      const passedRuns = backendSummary.passedRuns ?? 0
      const computedSuccessRate =
        backendSummary.successRate ?? (totalRuns ? Math.round((passedRuns / totalRuns) * 100) : 0)

      setSummary({
        totalTestCases: backendSummary.totalTestCases ?? 0,
        totalRuns,
        passedRuns,
        failedRuns: backendSummary.failedRuns ?? 0,
        successRate: computedSuccessRate,
      })
      setRuns(runResponse.data || [])
      setDataMode('api')
      return
    } catch {
      try {
        const [testsResponse, runsResponse] = await Promise.all([getTests(), getRuns()])
        const fallbackSummary = computeSummaryFromData(testsResponse, runsResponse)
        setSummary(fallbackSummary)
        setRuns((runsResponse.data || []).slice(0, 3))
        setDataMode('fallback')
        return
      } catch (fallbackError) {
        setSummary({
          totalTestCases: 0,
          totalRuns: 0,
          passedRuns: 0,
          failedRuns: 0,
          successRate: 0,
        })
        setRuns([])
        setHasData(false)
        setDataMode('fallback')
        setError(
          fallbackError.response?.data?.message ||
            fallbackError.response?.data?.error ||
            'No data available',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchDashboardSummary()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  if (loading) {
    return <Loader label="Loading dashboard insights..." />
  }

  if (!hasData) {
    return (
      <div className="flex flex-col gap-4">
        {error ? <ErrorMessage message={error} onRetry={fetchDashboardSummary} /> : null}
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">No data available</h2>
          <p className="mt-3 text-sm text-gray-500">
            Dashboard summary could not be loaded from the backend or computed from fallback APIs.
          </p>
        </section>
      </div>
    )
  }

  const stats = [
    { label: 'Total Test Cases', value: summary?.totalTestCases ?? 0, accent: 'text-slate-950' },
    { label: 'Total Runs', value: summary?.totalRuns ?? 0, accent: 'text-slate-950' },
    { label: 'Passed Runs', value: summary?.passedRuns ?? 0, accent: 'text-emerald-600' },
    { label: 'Failed Runs', value: summary?.failedRuns ?? 0, accent: 'text-rose-600' },
  ]

  const dataBadge =
    dataMode === 'fallback' ? 'Live computed data (fallback mode)' : 'Live backend data'

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorMessage message={error} onRetry={fetchDashboardSummary} /> : null}

      <section className="overflow-hidden rounded-xl bg-gradient-to-r from-blue-700 via-blue-600 to-slate-800 p-8 text-white shadow-md">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-blue-100">{appName}</p>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {dataBadge}
              </span>
            </div>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold sm:text-5xl">
              See release risk before users do.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-100">
              Centralize AI-generated scripts, execution history, and bug evidence in one clean
              frontend workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/tests"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Explore Test Cases
              </Link>
              <Link
                to="/bugs"
                className="rounded-xl border border-blue-300 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700/40"
              >
                Review Bugs
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {stats.slice(0, 2).map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white/10 p-5 backdrop-blur">
                <p className="text-sm text-blue-100">{stat.label}</p>
                <p className={`mt-3 text-4xl font-semibold ${stat.accent}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`mt-3 text-3xl font-semibold ${stat.accent}`}>{stat.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Recent Runs</h2>
              <p className="mt-1 text-sm text-gray-500">
                Latest execution snapshots from your automated suite.
              </p>
            </div>
            <Link to="/tests" className="text-sm font-semibold text-blue-600">
              Open Tests
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {runs.length ? (
              runs.map((run) => <RunResultCard key={run.id} run={run} />)
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-gray-500">
                No runs have been executed yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Health Snapshot</h2>
          <div className="mt-5 space-y-4">
            <div className="rounded-xl bg-emerald-50 p-5">
              <p className="text-sm text-emerald-700">Success Rate</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-700">
                {summary?.successRate ?? 0}%
              </p>
            </div>
            <div className="rounded-xl bg-rose-50 p-5">
              <p className="text-sm text-rose-700">Failure Pressure</p>
              <p className="mt-3 text-3xl font-semibold text-rose-700">
                {summary?.failedRuns ?? 0}
              </p>
            </div>
            <p className="text-sm leading-6 text-gray-500">
              The dashboard first attempts live backend summary data. If that endpoint is
              unavailable, it computes totals and pass/fail ratios from existing test and run APIs.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Dashboard
