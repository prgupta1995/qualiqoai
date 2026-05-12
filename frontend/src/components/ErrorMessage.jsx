function ErrorMessage({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-rose-600">Request failed</p>
          <p className="mt-2 text-sm leading-6">{message}</p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            Try Again
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default ErrorMessage
