import { useState } from 'react'
import { MemoryRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { resetDemo } from '../demo/server'
import JobEntryPage from '../pages/JobEntryPage'
import DataPage from '../pages/DataPage'

type Role = 'admin' | 'supervisor' | 'crew'

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'crew', label: 'Crew', hint: 'Can add and edit jobs, not delete or export' },
  { id: 'supervisor', label: 'Supervisor', hint: 'Can also delete jobs and export' },
  { id: 'admin', label: 'Admin', hint: 'Can do everything above, plus set up the form and people' },
]

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex h-11 items-center rounded-lg px-4 font-semibold ${isActive ? 'bg-primary text-white' : 'text-ink hover:bg-active'}`

function Bar() {
  const { workspace, demo } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const current = workspace?.role ?? 'admin'
  const [note, setNote] = useState('')

  const start = async (role: Role) => {
    await demo(role)
    setNote(`Now using it as ${ROLES.find((r) => r.id === role)?.label.toLowerCase()}.`)
  }
  const reset = () => {
    resetDemo()
    queryClient.invalidateQueries()
    navigate('/entry')
    setNote('Demo data reset.')
  }

  return (
    <div className="border-b border-line bg-raised px-3 py-3 md:px-5">
      <div className="flex items-center gap-3">
        <nav aria-label="Demo screens" className="flex gap-1">
          <NavLink to="/entry" className={tabClass}>
            Fill the form
          </NavLink>
          <NavLink to="/data" className={tabClass}>
            See the data
          </NavLink>
        </nav>
        <button
          type="button"
          onClick={reset}
          className="ml-auto inline-flex h-11 cursor-pointer items-center px-2 text-[13px] font-semibold text-muted underline underline-offset-4 hover:text-ink"
        >
          Reset demo
        </button>
      </div>
      <fieldset className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <legend className="sr-only">Use the demo as</legend>
        <span className="text-[13px] text-muted" aria-hidden="true">
          Try it as
        </span>
        <div className="flex rounded-lg border border-control bg-surface p-0.5">
          {ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              aria-pressed={current === role.id}
              onClick={() => start(role.id)}
              className={`h-11 min-w-11 cursor-pointer rounded-md px-3 text-[13px] font-semibold ${current === role.id ? 'bg-primary text-white' : 'text-ink hover:bg-active'}`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-xs text-muted" role="status">
        {note || `${ROLES.find((r) => r.id === current)?.label}: ${ROLES.find((r) => r.id === current)?.hint.toLowerCase()}. Nothing you enter is saved anywhere.`}
      </p>
    </div>
  )
}

function Frame() {
  const { status } = useAuth()
  if (status === 'loading') return <p className="p-8 text-center text-muted">Opening the demo…</p>
  return (
    <>
      <Bar />
      <div className="max-h-[78dvh] overflow-y-auto px-3 py-4 md:px-5" tabIndex={-1}>
        <Routes>
          <Route path="/entry" element={<JobEntryPage />} />
          <Route path="/jobs/:id/edit" element={<JobEntryPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="*" element={<Navigate to="/entry" replace />} />
        </Routes>
      </div>
    </>
  )
}

export default function Trial() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }))
  return (
    <div className="demo-frame relative overflow-hidden rounded-2xl border border-line bg-ground shadow-sm">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/entry']}>
          <AuthProvider>
            <Frame />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </div>
  )
}
