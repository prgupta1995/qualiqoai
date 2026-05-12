import { useEffect, useState } from 'react'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import {
  clearStoredTesttoriaApiKey,
  createApiKey,
  getStoredTesttoriaApiKey,
  listApiKeys,
  revokeApiKey,
  saveStoredTesttoriaApiKey,
} from '../services/api'

function SettingsApiKeys() {
  const [keyName, setKeyName] = useState('Default AI key')
  const [generatedKey, setGeneratedKey] = useState('')
  const [storedKeyPreview, setStoredKeyPreview] = useState(() =>
    getStoredTesttoriaApiKey() ? 'Stored in this browser' : '',
  )
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const refreshKeys = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await listApiKeys()
      setKeys(response.data || [])
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
    const timerId = window.setTimeout(() => {
      refreshKeys()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [])

  const handleGenerateKey = async (event) => {
    event.preventDefault()

    try {
      setBusyAction('create')
      setError('')
      setStatusMessage('')
      const response = await createApiKey(keyName.trim() || 'Default AI key')
      const createdKey = response.apiKey?.key || ''

      setGeneratedKey(createdKey)
      saveStoredTesttoriaApiKey(createdKey)
      setStoredKeyPreview(response.apiKey?.keyPreview || 'Stored in this browser')
      setStatusMessage('New Testtoria API key generated and stored in this browser.')
      await refreshKeys()
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

  const handleCopyKey = async () => {
    if (!generatedKey) {
      return
    }

    try {
      await navigator.clipboard.writeText(generatedKey)
      setStatusMessage('Generated key copied to clipboard.')
    } catch {
      setStatusMessage('Copy failed. Please copy the key manually.')
    }
  }

  const handleClearStoredKey = () => {
    clearStoredTesttoriaApiKey()
    setStoredKeyPreview('')
    setStatusMessage('Browser-stored Testtoria API key removed.')
  }

  const handleRevokeKey = async (id) => {
    try {
      setBusyAction(id)
      setError('')
      setStatusMessage('')
      await revokeApiKey(id)
      await refreshKeys()
      setStatusMessage('API key revoked successfully.')
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
    return <Loader label="Loading API keys..." />
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Settings</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-3xl">
          Manage Testtoria API keys
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Testtoria uses a local AI model by default. To enable AI generation, install Ollama and
          run:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">
{`ollama pull llama3.1
ollama serve`}
        </pre>
        <p className="mt-3 text-sm text-gray-500">No OpenAI API key is required.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Generate Key</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Create a new internal AI key</h2>
        <form className="mt-4 flex flex-col gap-4 md:flex-row md:items-end" onSubmit={handleGenerateKey}>
          <label className="flex-1 text-sm text-gray-500">
            Key name
            <input
              type="text"
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              placeholder="Default AI key"
            />
          </label>
          <button
            type="submit"
            disabled={busyAction === 'create'}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {busyAction === 'create' ? 'Generating...' : 'Generate Testtoria API Key'}
          </button>
        </form>

        {generatedKey ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              Copy this key now. It will only be shown once.
            </p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
              <code className="block min-w-0 flex-1 overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-100">
                {generatedKey}
              </code>
              <button
                type="button"
                onClick={handleCopyKey}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Copy key
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">Browser key status</p>
          <p className="mt-2 text-sm text-gray-500">
            {storedKeyPreview || 'No Testtoria API key is stored in this browser yet.'}
          </p>
          <button
            type="button"
            onClick={handleClearStoredKey}
            className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Clear browser key
          </button>
        </div>

        {statusMessage ? <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p> : null}
        {error ? <div className="mt-4"><ErrorMessage message={error} /></div> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
        <p className="text-sm text-gray-500">Existing Keys</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Active Testtoria API keys</h2>

        {!keys.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-gray-500">
            No API keys created yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px] divide-y divide-slate-200 rounded-xl border border-slate-200">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between gap-4 bg-white px-4 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{key.name}</p>
                    <p className="mt-1 text-sm text-gray-500">{key.keyPreview}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Created {new Date(key.createdAt).toLocaleString()}
                      {key.lastUsedAt ? ` • Last used ${new Date(key.lastUsedAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeKey(key.id)}
                    disabled={busyAction === key.id}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    {busyAction === key.id ? 'Revoking...' : 'Revoke key'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default SettingsApiKeys
