import { NavLink } from 'react-router-dom'

const navigation = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Record Test', to: '/record' },
  { label: 'Selector Finder', to: '/selectors' },
  { label: 'Test Cases', to: '/tests' },
  { label: 'Bugs', to: '/bugs' },
  { label: 'API Keys', to: '/settings/api-keys' },
]

function Sidebar({ appName, onLogout }) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001'

  return (
    <aside className="hidden h-screen w-72 flex-col border-r border-slate-200 bg-slate-900 px-6 py-8 text-slate-100 lg:flex">
      <div>
        <p className="text-sm text-blue-300">AI QA Automation</p>
        <h1 className="mt-3 text-3xl font-semibold">{appName}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Monitor scripted tests, review failures, and keep release quality visible.
        </p>
      </div>

      <nav className="mt-10 flex flex-col gap-2">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={onLogout}
          className="mt-2 rounded-xl bg-blue-600 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Logout
        </button>
      </nav>

      <div className="mt-auto rounded-xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm text-slate-400">Backend</p>
        <p className="mt-2 break-all text-sm text-slate-200">Connected to {apiBaseUrl}</p>
        <p className="mt-2 text-sm text-slate-500">
          Set `VITE_APP_NAME` to rename the platform without changing code.
        </p>
      </div>
    </aside>
  )
}

export default Sidebar
