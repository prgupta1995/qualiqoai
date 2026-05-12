import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import Bugs from './pages/Bugs'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import RecordTest from './pages/RecordTest'
import Register from './pages/Register'
import SelectorFinder from './pages/SelectorFinder'
import SettingsApiKeys from './pages/SettingsApiKeys'
import TestCaseDetail from './pages/TestCaseDetail'
import TestCases from './pages/TestCases'
import TestRunResults from './pages/TestRunResults'
import { clearAuthSession, isAuthenticated } from './services/api'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Testtoria.ai'

function AppLayout() {
  const handleLogout = () => {
    clearAuthSession()
    window.location.assign('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <Sidebar appName={APP_NAME} onLogout={handleLogout} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header appName={APP_NAME} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function PublicOnlyRoute({ children }) {
  return isAuthenticated() ? <Navigate to="/dashboard" replace /> : children
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login appName={APP_NAME} />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <Register appName={APP_NAME} />
          </PublicOnlyRoute>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard appName={APP_NAME} />} />
          <Route path="/record" element={<RecordTest />} />
          <Route path="/selectors" element={<SelectorFinder />} />
          <Route path="/selector-finder" element={<SelectorFinder />} />
          <Route path="/settings/api-keys" element={<SettingsApiKeys />} />
          <Route path="/tests" element={<TestCases />} />
          <Route path="/tests/:id" element={<TestCaseDetail />} />
          <Route path="/runs/:id" element={<TestRunResults />} />
          <Route path="/bugs" element={<Bugs />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated() ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

export default App
