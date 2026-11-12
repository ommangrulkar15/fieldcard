import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import FieldInput from '../components/FieldInput'
import { Banner, Button, PageTitle, Spinner } from '../components/ui'
import { PhotoGallery, PhotoQueue } from '../components/Photos'
import { ApiError, get, patch, post, upload } from '../lib/api'
import { shrinkPhoto } from '../lib/image'
import { todayIso } from '../lib/format'
import type { Field, Job, Value } from '../lib/types'
import { useFields } from './DataPage'

type Values = Record<string, Value>

const blankJob = (): Values => ({ date: todayIso(), status: 'open' })

function groupFields(fields: Field[]) {
  const shown = fields
    .filter((field) => field.on_form && field.type !== 'photo')
    .sort((a, b) => (a.group_position ?? 0) - (b.group_position ?? 0) || a.position - b.position)
  const groups: { name: string; fields: Field[] }[] = []
  for (const field of shown) {
    const name = field.group_name ?? 'Details'
    const last = groups[groups.length - 1]
    if (last && last.name === name) last.fields.push(field)
    else groups.push({ name, fields: [field] })
  }
  return groups
}

export default function JobEntryPage() {
  const { id } = useParams()
  const editing = !!id
  const { workspace } = useAuth()
  const workspaceId = workspace?.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fieldsQuery = useFields(workspaceId)

  const job = useQuery({
    queryKey: ['job', workspaceId, id],
    queryFn: () => get<Job>(`/workspaces/${workspaceId}/jobs/${id}`),
    enabled: editing && !!workspaceId,
  })

  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [queued, setQueued] = useState<File[]>([])

  const hasPhotos = (fieldsQuery.data ?? []).some((field) => field.type === 'photo')
  const groups = useMemo(() => groupFields(fieldsQuery.data ?? []), [fieldsQuery.data])

  // Seed the form once: the job's values when editing, today's date when creating.
  useEffect(() => {
    if (editing && job.data) setValues(job.data.values)
    if (!editing) setValues(blankJob())
  }, [editing, job.data])

  const save = useMutation({
    mutationFn: async () => {
      const body: Values = {}
      for (const [key, value] of Object.entries(values)) {
        if (value === '' && !editing) continue
        body[key] = value
      }
      if (editing) return { job: await patch<Job>(`/workspaces/${workspaceId}/jobs/${id}`, { values: body }), failed: 0 }
      const job = await post<Job>(`/workspaces/${workspaceId}/jobs`, { values: body })
      let failed = 0
      for (const file of queued) {
        try {
          await upload(`/workspaces/${workspaceId}/jobs/${job.id}/photos`, await shrinkPhoto(file), 'photo.webp')
        } catch {
          failed += 1 // the job is already saved; never lose it over a photo
        }
      }
      return { job, failed }
    },
    onSuccess: ({ job: result, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['job', workspaceId, id] })
      if (editing) navigate('/data')
      else {
        setSaved(
          `Job card ${result.values.job_no} saved` +
            (failed ? `. ${failed} ${failed === 1 ? 'photo' : 'photos'} could not be uploaded; open the job and add them again.` : ''),
        )
        setValues(blankJob())
        setQueued([])
        setErrors({})
        setFormError(null)
        window.scrollTo({ top: 0 })
      }
    },
    onError: (error) => {
      const apiError = error as ApiError
      setSaved(null)
      setErrors(apiError.errors ?? {})
      const count = Object.keys(apiError.errors ?? {}).length
      setFormError(count ? `Fix ${count} ${count === 1 ? 'field' : 'fields'} and save again.` : apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSaved(null)
    save.mutate()
  }

  if (fieldsQuery.isLoading || (editing && job.isLoading)) return <Spinner label="Loading form" />
  if (editing && job.isError) return <Banner tone="error">{(job.error as ApiError).message}</Banner>

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-[720px] pb-28">
      <PageTitle>{editing ? `Edit job card ${values.job_no ?? ''}` : 'Job Entry'}</PageTitle>

      {saved && (
        <div className="mb-4">
          <Banner tone="ok">{saved}</Banner>
        </div>
      )}
      {formError && (
        <div className="mb-4">
          <Banner tone="error">{formError}</Banner>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.name} aria-labelledby={`g-${group.name}`} className="mb-4 rounded-xl border border-line bg-surface p-4 md:p-5">
          <h2 id={`g-${group.name}`} className="mb-3 text-base font-semibold">
            {group.name}
          </h2>
          {group.fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.key]}
              error={errors[field.key]}
              placeholder={field.key === 'job_no' && !editing ? 'Auto-assigned' : undefined}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </section>
      ))}

      {hasPhotos && (
        <section aria-labelledby="g-photos" className="mb-4 rounded-xl border border-line bg-surface p-4 md:p-5">
          <h2 id="g-photos" className="mb-3 text-base font-semibold">
            Photos
          </h2>
          {editing && workspaceId && id ? (
            <PhotoGallery workspaceId={workspaceId} jobId={id} canEdit />
          ) : (
            <PhotoQueue files={queued} onChange={setQueued} />
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] max-md:bottom-[calc(56px+env(safe-area-inset-bottom))] md:static md:mt-2 md:border-0 md:bg-transparent md:px-0">
        <div className="mx-auto flex max-w-[720px] gap-2">
          {editing && (
            <Button variant="secondary" onClick={() => navigate('/data')}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save job card'}
          </Button>
        </div>
      </div>
    </form>
  )
}
