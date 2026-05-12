import { NavLink } from 'react-router-dom'
import { getStoredUser } from '../services/api'

function Header({ appName, onLogout }) {
  const user = getStoredUser()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 lg:hidden">{appName}</p>
            <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">
              Quality command center
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Review coverage, generate scripts, run checks, and triage failures quickly.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right sm:block">
              <p className="text-sm text-gray-500">{user?.name || 'Authenticated user'}</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{user?.email || appName}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Logout
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-2 overflow-x-auto lg:hidden">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap ${
                isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/record"
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap ${
                isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`
            }
          >
            Record Test
          </NavLink>
          <NavLink
            to="/tests"
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap ${
                isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`
            }
          >
            Test Cases
          </NavLink>
          <NavLink
            to="/bugs"
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap ${
                isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`
            }
          >
            Bugs
          </NavLink>
          <NavLink
            to="/settings/api-keys"
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap ${
                isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`
            }
          >
            API Keys
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

export default Header
