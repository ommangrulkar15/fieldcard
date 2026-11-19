import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import '../index.css'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { applyBrand, clearBrand } from '../lib/brand'
import { resetDemo } from '../demo/server'
import JobEntryPage from '../pages/JobEntryPage'
import DataPage from '../pages/DataPage'

/**
 * The live app, rendered on its own page so a phone-wide or laptop-wide frame around it
 * gets the real responsive layout. The landing page talks to it with postMessage.
 */
function Bridge() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { demo } = useAuth()
  const { pathname } = useLocation()
  const path = useRef(pathname)
  path.current = pathname

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return
      const m = e.data as { type?: string; to?: string; hex?: string | null; role?: 'admin' | 'supervisor' | 'crew' }
      if (m?.type === 'go' && m.to) navigate(m.to)
      else if (m?.type === 'brand') (m.hex ? applyBrand(m.hex, document.documentElement) : clearBrand(document.documentElement))
      else if (m?.type === 'role' && m.role) void demo(m.role)
      else if (m?.type === 'reset') {
        resetDemo()
        void queryClient.invalidateQueries()
        navigate('/entry')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [demo, navigate, queryClient])

  // Tell the page when a new job card has been saved, so it can show the job arriving in the office.
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success' && path.current === '/entry') {
          window.parent.postMessage({ type: 'saved' }, '*')
        }
      }),
    [queryClient],
  )
  return null
}

function Screen() {
  const { status } = useAuth()
  if (status === 'loading') return <p className="p-8 text-center text-muted">Opening the demo…</p>
  return (
    <div className="mx-auto min-h-dvh max-w-6xl bg-ground px-3 pb-4 pt-10 md:px-6 md:py-6">
      <Routes>
        <Route path="/entry" element={<JobEntryPage />} />
        <Route path="/jobs/:id/edit" element={<JobEntryPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="*" element={<Navigate to="/entry" replace />} />
      </Routes>
    </div>
  )
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/entry']}>
        <AuthProvider>
          <Bridge />
          <Screen />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
)
