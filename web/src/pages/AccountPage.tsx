import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Banner, Button, PageTitle } from '../components/ui'
import { ApiError, post } from '../lib/api'
import { TextField } from './AuthPages'

export default function AccountPage() {
  const { me, workspace, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setDone(false)
    setError(null)
    try {
      await post('/auth/change-password', { current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      setDone(true)
    } catch (caught) {
      setError(caught as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[520px]">
      <PageTitle>Account</PageTitle>

      <section className="mb-4 rounded-xl border border-line bg-surface app-card p-5" aria-label="Profile">
        <p className="font-semibold">{me?.user.name}</p>
        <p className="text-muted">{me?.user.email}</p>
        {workspace && (
          <p className="mt-2 text-sm text-muted">
            {workspace.name} · <span className="capitalize">{workspace.role}</span>
          </p>
        )}
      </section>

      <form onSubmit={submit} className="mb-4 rounded-xl border border-line bg-surface app-card p-5">
        <h2 className="mb-3 text-base font-semibold">Change password</h2>
        {done && (
          <div className="mb-3">
            <Banner tone="ok">Password changed. Other devices have been signed out.</Banner>
          </div>
        )}
        {error && !error.errors.password && (
          <div className="mb-3">
            <Banner tone="error">{error.message}</Banner>
          </div>
        )}
        <TextField
          id="current"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
        />
        <TextField
          id="new"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          hint="At least 10 characters."
          error={error?.errors.password}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </Button>
      </form>

      <Button variant="secondary" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  )
}
