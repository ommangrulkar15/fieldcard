import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import FieldInput from '../components/FieldInput'
import { Banner, Button, PageTitle, Spinner } from '../components/ui'
import { PhotoGallery, PhotoQueue } from '../components/Photos'
import { ApiError, get, patch, post, upload } from '../lib/api'
import { DEMO } from '../lib/errors'
import { shrinkPhoto } from '../lib/image'
import { todayIso } from '../lib/format'
import type { Field, Job, Value } from '../lib/types'
import { useFields } from '../lib/queries'

type Values = Record<string, Value>

// In the demo the description starts filled in, so one tap on Save shows the whole loop.
const blankJob = (): Values => ({
  date: todayIso(),
  status: 'open',
  ...(DEMO ? { description: 'Replaced worn pump seal on unit U7' } : {}),
})

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
  const noticeRef = useRef<HTMLDivElement>(null)

  const hasPhotos = (fieldsQuery.data ?? []).some((field) => field.type === 'photo')
  const groups = useMemo(() => groupFields(fieldsQuery.data ?? []), [fieldsQuery.data])

  // Seed the form once per job: a background refetch must never overwrite what the person is typing.
  const seededFor = useRef<string | null>(null)
  useEffect(() => {
    const target = editing ? (job.data?.id ?? null) : 'new'
    if (target === null || seededFor.current === target) return
    seededFor.current = target
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the loaded job into editable form state
    setValues(editing && job.data ? job.data.values : blankJob())
  }, [editing, job.data])

  // Bring the result into view. This scrolls the page or, in the demo, the frame and the page around it.
  useEffect(() => {
    if (saved || formError) noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [saved, formError])

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
        try {
          navigator.vibrate?.(15)
        } catch {
          /* haptics are optional */
        }
        setSaved(
          `Job card ${result.values.job_no} ${DEMO ? 'added to the demo' : 'saved'}` +
            (failed ? `. ${failed} ${failed === 1 ? 'photo' : 'photos'} could not be uploaded; open the job and add them again.` : ''),
        )
        setValues(blankJob())
        setQueued([])
        setErrors({})
        setFormError(null)
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

  // The demo opens on the few fields that matter and tucks the rest away; the full app shows everything.
  const compact = DEMO && !editing
  const moreHasError = groups.slice(1).some((group) => group.fields.some((field) => errors[field.key]))

  const renderGroup = (group: (typeof groups)[number], index: number, bare = false) => (
    <section
      key={group.name}
      aria-labelledby={`g-${index}`}
      className={bare ? 'mb-4 border-t border-line pt-4' : 'mb-4 rounded-xl border border-line bg-surface app-card p-4 md:p-5'}
    >
      <h2 id={`g-${index}`} className="mb-3 text-base font-semibold">
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
  )

  if (fieldsQuery.isLoading || (editing && job.isLoading)) return <Spinner label="Loading form" />
  if (editing && job.isError) return <Banner tone="error">{(job.error as ApiError).message}</Banner>

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-[720px] pb-28">
      <PageTitle>{editing ? `Edit job card ${values.job_no ?? ''}` : 'Job Entry'}</PageTitle>

      {saved && (
        <div ref={noticeRef} className="app-pop mb-4 scroll-mt-24">
          <Banner tone="ok">{saved}</Banner>
          <button
            type="button"
            onClick={() => navigate('/data')}
            className="mt-2 inline-flex h-11 cursor-pointer items-center font-semibold underline underline-offset-4 hover:text-brand"
          >
            See it in the table
          </button>
        </div>
      )}
      {formError && (
        <div ref={noticeRef} className="fc-pop mb-4 scroll-mt-24">
          <Banner tone="error">{formError}</Banner>
        </div>
      )}

      {(compact ? groups.slice(0, 1) : groups).map((group, index) => renderGroup(group, index))}

      {hasPhotos && (
        <section aria-labelledby="g-photos" className="mb-4 rounded-xl border border-line bg-surface app-card p-4 md:p-5">
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

      {compact && groups.length > 1 && (
        <details className="mb-4 rounded-xl border border-line bg-surface" open={moreHasError || undefined}>
          <summary className="flex min-h-14 cursor-pointer items-center px-4 py-3 font-semibold md:px-5">
            More fields: {groups.slice(1).map((g) => g.name.replace(/ \(.*\)$/, '')).join(', ')}
          </summary>
          <div className="px-4 pb-1 md:px-5">{groups.slice(1).map((group, index) => renderGroup(group, index + 1, true))}</div>
        </details>
      )}

      <div className="app-glass fixed inset-x-0 bottom-0 z-10 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] max-md:bottom-[calc(56px+env(safe-area-inset-bottom))] md:static md:mt-2 md:border-0 md:bg-transparent md:px-0">
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
