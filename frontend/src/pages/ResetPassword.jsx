import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import { resetPassword, saveAuthSession } from '../services/api'

function ResetPassword({ appName }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!token) {
      setError('Reset token is missing. Please request a new password reset link.')
      return
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const response = await resetPassword({ token, password: form.password })
      saveAuthSession(response.token, response.user)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          'Unable to reset password. Please request a new link.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Create a new password</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Reset {appName} password</h1>
        <p className="mt-2 text-sm text-gray-500">
          Choose a new password for your account. Reset links can only be used once.
        </p>

        {!token ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            Reset token is missing. Request a new password reset link.
          </div>
        ) : null}

        {error ? <div className="mt-4"><ErrorMessage message={error} /></div> : null}

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm text-gray-500">New password</span>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              placeholder="Create a new password"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-gray-500">Confirm password</span>
            <input
              type="password"
              required
              minLength={8}
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              placeholder="Re-enter new password"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !token}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Resetting password...' : 'Reset password'}
          </button>
        </form>

        {loading ? <div className="mt-4"><Loader label="Resetting password..." /></div> : null}

        <p className="mt-6 text-sm text-gray-500">
          Need a new link?{' '}
          <Link to="/forgot-password" className="font-semibold text-blue-600 hover:text-blue-700">
            Request reset link
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ResetPassword
