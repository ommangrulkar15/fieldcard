import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Banner, Button } from '../components/ui'
import { Logo } from '../components/icons'
import { ApiError, get } from '../lib/api'

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
          <Logo size={32} />
          Fieldcard
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-5 text-muted">{subtitle}</p>
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-faint">
          Fieldcard is a portfolio concept. All names and data in the demo are fictional.
        </p>
      </div>
    </div>
  )
}

export function TextField(props: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  error?: string
  hint?: string
  required?: boolean
}) {
  const describedBy = props.error ? `${props.id}-error` : props.hint ? `${props.id}-hint` : undefined
  return (
    <div className="mb-4">
      <label htmlFor={props.id} className="mb-1 block text-sm font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        required={props.required ?? true}
        autoComplete={props.autoComplete}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => props.onChange(event.target.value)}
        className={`h-11 w-full rounded-lg border bg-surface px-3 text-base md:text-sm ${props.error ? 'border-bad' : 'border-control'}`}
      />
      {props.error ? (
        <p id={`${props.id}-error`} className="mt-1 text-sm text-bad">
          {props.error}
        </p>
      ) : (
        props.hint && (
          <p id={`${props.id}-hint`} className="mt-1 text-xs text-muted">
            {props.hint}
          </p>
        )
      )}
    </div>
  )
}

function usePublicConfig() {
  const [config, setConfig] = useState({ signup_enabled: true, demo_enabled: false })
  useEffect(() => {
    get<typeof config>('/config').then(setConfig).catch(() => undefined)
  }, [])
  return config
}

const DEMO_ROLES = [
  { role: 'crew', label: 'Crew', hint: 'Enters and edits jobs' },
  { role: 'supervisor', label: 'Supervisor', hint: 'Also deletes and exports' },
  { role: 'admin', label: 'Admin', hint: 'Also sets up the form and users' },
] as const

export function LoginPage() {
  const { status, login, demo } = useAuth()
  const config = usePublicConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'authed') return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame title="Sign in" subtitle="Welcome back. Pick up where your crew left off.">
      <form onSubmit={submit} noValidate={false}>
        {error && (
          <div className="mb-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
        <TextField id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      {config.demo_enabled && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium">Try the demo, no account needed</p>
          <div className="grid gap-2">
            {DEMO_ROLES.map((item) => (
              <button
                key={item.role}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    await demo(item.role)
                  } catch (problem) {
                    setError(problem instanceof ApiError ? problem.message : 'Could not open the demo')
                  } finally {
                    setBusy(false)
                  }
                }}
                className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-control bg-surface px-3 text-left hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-medium">Continue as {item.label}</span>
                <span className="text-xs text-muted">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {config.signup_enabled && (
        <p className="mt-4 text-sm text-muted">
          New here?{' '}
          <Link to="/signup" className="font-medium text-ink underline">
            Create a workspace
          </Link>
        </p>
      )}
    </Frame>
  )
}

const TEMPLATES = [
  { value: 'electrical', label: 'Electrical contractor' },
  { value: 'blank', label: 'Start blank' },
]

export function SignupPage() {
  const { status, signup } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', workspace_name: '', template: 'electrical' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'authed') return <Navigate to="/" replace />
  const set = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setErrors({})
    try {
      await signup(form)
    } catch (problem) {
      if (problem instanceof ApiError) {
        setErrors(problem.errors)
        setError(Object.keys(problem.errors).length ? '' : problem.message)
      } else setError('Could not create the workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame title="Create a workspace" subtitle="You become its admin. You can add your crew afterwards.">
      <form onSubmit={submit}>
        {error && (
          <div className="mb-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        <TextField id="name" label="Your name" value={form.name} onChange={set('name')} autoComplete="name" error={errors.name} />
        <TextField id="email" label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="username" error={errors.email} />
        <TextField
          id="password"
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          error={errors.password}
          hint="At least 10 characters."
        />
        <TextField id="workspace" label="Workspace name" value={form.workspace_name} onChange={set('workspace_name')} error={errors.name ? undefined : errors.workspace_name} />
        <div className="mb-5">
          <label htmlFor="template" className="mb-1 block text-sm font-medium">
            Starting template
          </label>
          <select
            id="template"
            value={form.template}
            onChange={(event) => set('template')(event.target.value)}
            className="h-11 w-full rounded-lg border border-control bg-surface px-3 text-base md:text-sm"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {errors.template && <p className="mt-1 text-sm text-bad">{errors.template}</p>}
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create workspace'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-ink underline">
          Sign in
        </Link>
      </p>
    </Frame>
  )
}
