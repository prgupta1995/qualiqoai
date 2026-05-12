function Loader({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-10 text-gray-500 shadow-md">
      <div className="h-11 w-11 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}

export default Loader
