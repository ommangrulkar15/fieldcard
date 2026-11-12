import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { Banner, Button, Dialog, Spinner } from '../../components/ui'
import { TextField } from '../AuthPages'
import { ApiError, del, get, patch, post } from '../../lib/api'
import type { Member } from '../../lib/types'

const ROLES = [
  { value: 'crew', label: 'Crew', hint: 'Enter and edit jobs' },
  { value: 'supervisor', label: 'Supervisor', hint: 'Crew, plus delete and export' },
  { value: 'admin', label: 'Admin', hint: 'Everything, including form setup and users' },
]

export default function UsersTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const { me } = useAuth()
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<Member | null>(null)
  const [error, setError] = useState<string | null>(null)

  const members = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => get<Member[]>(`/workspaces/${workspaceId}/members`),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
  const fail = (e: unknown) => setError((e as ApiError).message)

  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: string }) => patch(`/workspaces/${workspaceId}/members/${input.id}`, { role: input.role }),
    onSuccess: () => {
      setError(null)
      void refresh()
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) => del(`/workspaces/${workspaceId}/members/${id}`),
    onSuccess: () => {
      setError(null)
      void refresh()
    },
    onError: fail,
  })

  if (members.isLoading) return <Spinner label="Loading users" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-muted">Everyone here signs in with their own email and password.</p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add user
        </Button>
      </div>
      {error && (
        <div className="mb-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {(members.data ?? []).map((member) => {
          const self = member.user_id === me?.user.id
          return (
            <li key={member.user_id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-[180px] flex-1">
                <p className="font-medium">
                  {member.name || member.email}
                  {self && <span className="ml-2 text-xs text-muted">(you)</span>}
                </p>
                <p className="text-sm text-muted">{member.email}</p>
              </div>
              <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                Role for {member.email}
              </label>
              <select
                id={`role-${member.user_id}`}
                value={member.role}
                onChange={(event) => changeRole.mutate({ id: member.user_id, role: event.target.value })}
                className="h-11 rounded-lg border border-control bg-surface px-2"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <Button small variant="secondary" onClick={() => setResetting(member)}>
                Reset password
              </Button>
              {!self && (
                <Button
                  small
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Remove ${member.email} from this workspace?`)) remove.mutate(member.user_id)
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <dl className="mt-4 text-sm text-muted">
        {ROLES.map((role) => (
          <div key={role.value} className="flex gap-2">
            <dt className="w-24 font-medium text-ink">{role.label}</dt>
            <dd>{role.hint}</dd>
          </div>
        ))}
      </dl>

      {adding && (
        <AddUserDialog
          workspaceId={workspaceId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void refresh()
          }}
        />
      )}
      {resetting && <ResetDialog workspaceId={workspaceId} member={resetting} onClose={() => setResetting(null)} />}
    </div>
  )
}

function AddUserDialog(props: { workspaceId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'crew' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      await post(`/workspaces/${props.workspaceId}/members`, form)
      props.onSaved()
    } catch (caught) {
      const problem = caught as ApiError
      setErrors(problem.errors ?? {})
      if (!Object.keys(problem.errors ?? {}).length) setMessage(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title="Add a user"
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-user" variant="primary" className="flex-1" disabled={busy}>
            {busy ? 'Adding…' : 'Add user'}
          </Button>
        </>
      }
    >
      <form id="add-user" onSubmit={submit} noValidate>
        {message && (
          <div className="mb-3">
            <Banner tone="error">{message}</Banner>
          </div>
        )}
        <TextField id="au-name" label="Name" value={form.name} onChange={set('name')} required={false} error={errors.name} />
        <TextField id="au-email" label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
        <TextField
          id="au-password"
          label="Starting password"
          type="text"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 10 characters. Tell them in person; they can change it under Account."
        />
        <div className="mb-2">
          <label htmlFor="au-role" className="mb-1 block text-sm font-medium">
            Role
          </label>
          <select
            id="au-role"
            value={form.role}
            onChange={(event) => set('role')(event.target.value)}
            className="h-11 w-full rounded-lg border border-control bg-surface px-3 text-base md:text-sm"
          >
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label} — {role.hint}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Dialog>
  )
}

function ResetDialog(props: { workspaceId: string; member: Member; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post(`/workspaces/${props.workspaceId}/members/${props.member.user_id}/password`, { new_password: password })
      setDone(true)
    } catch (caught) {
      const problem = caught as ApiError
      setError(problem.errors?.password ?? problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={`Reset password for ${props.member.name || props.member.email}`}
      footer={
        done ? (
          <Button variant="primary" className="flex-1" onClick={props.onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" form="reset-form" variant="primary" className="flex-1" disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Banner tone="ok">Password changed. They are signed out everywhere and must use the new one.</Banner>
      ) : (
        <form id="reset-form" onSubmit={submit} noValidate>
          {error && (
            <div className="mb-3">
              <Banner tone="error">{error}</Banner>
            </div>
          )}
          <TextField id="rp-password" label="New password" type="text" value={password} onChange={setPassword} hint="At least 10 characters." />
          <p className="text-sm text-muted">
            This only works for accounts you created that belong to no other workspace.
          </p>
        </form>
      )}
    </Dialog>
  )
}
