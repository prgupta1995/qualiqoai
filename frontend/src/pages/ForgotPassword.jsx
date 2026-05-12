import { useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import { requestPasswordReset } from '../services/api'

function ForgotPassword({ appName }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')
      setMessage('')
      const response = await requestPasswordReset(email)
      setMessage(response.message || 'If an account exists, a reset link has been sent.')
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          'Unable to request password reset. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Account recovery</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Reset your {appName} password</h1>
        <p className="mt-2 text-sm text-gray-500">
          Enter your registered email and we will send a one-time password reset link.
        </p>

        {error ? <div className="mt-4"><ErrorMessage message={error} /></div> : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
            <p>{message}</p>
          </div>
        ) : null}

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm text-gray-500">Registered email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Sending reset link...' : 'Send reset link'}
          </button>
        </form>

        {loading ? <div className="mt-4"><Loader label="Preparing reset link..." /></div> : null}

        <p className="mt-6 text-sm text-gray-500">
          Remember your password?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPassword
