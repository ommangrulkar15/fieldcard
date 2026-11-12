import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Shell from './components/Shell'
import { Logo } from './components/icons'
import AccountPage from './pages/AccountPage'
import AdminPage from './pages/AdminPage'
import { LoginPage, SignupPage } from './pages/AuthPages'
import DataPage from './pages/DataPage'
import JobEntryPage from './pages/JobEntryPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

/** Free hosting puts the API to sleep; say so instead of showing a blank screen. */
function Booting() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center" role="status">
      <div>
        <div className="mb-3 flex justify-center">
          <Logo size={40} />
        </div>
        <p className="font-medium">Opening Fieldcard…</p>
        {slow && (
          <p className="mx-auto mt-2 max-w-xs text-muted">
            The server was asleep and is waking up. This can take up to a minute the first time.
          </p>
        )}
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <Booting />
  if (status === 'anon') return <Navigate to="/login" replace />
  return <>{children}</>
}

function Home() {
  const { can } = useAuth()
  return <Navigate to={can('job:create') ? '/entry' : '/data'} replace />
}

function Admin() {
  const { can } = useAuth()
  return can('fields:manage') || can('users:manage') ? <AdminPage /> : <Navigate to="/data" replace />
}

function Entry() {
  const { can } = useAuth()
  return can('job:create') ? <JobEntryPage /> : <Navigate to="/data" replace />
}

function Edit() {
  const { can } = useAuth()
  return can('job:update') ? <JobEntryPage /> : <Navigate to="/data" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              element={
                <RequireAuth>
                  <Shell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/entry" element={<Entry />} />
              <Route path="/jobs/:id/edit" element={<Edit />} />
              <Route path="/data" element={<DataPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
