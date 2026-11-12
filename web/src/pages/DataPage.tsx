import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { Banner, Button, Dialog, PageTitle, Spinner, StatusPill } from '../components/ui'
import { DownloadIcon, SearchIcon } from '../components/icons'
import { PhotoGallery } from '../components/Photos'
import { ApiError, del, get, getBlob, saveBlob } from '../lib/api'
import { columnHeader, displayValue, EMPTY } from '../lib/format'
import type { Field, Job, JobPage } from '../lib/types'

const PAGE_SIZE = 10

export function useFields(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['fields', workspaceId],
    queryFn: () => get<Field[]>(`/workspaces/${workspaceId}/fields`, { include_hidden: 'false' }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function pageNumbers(current: number, last: number): number[] {
  const start = Math.max(1, Math.min(current - 2, last - 4))
  const end = Math.min(last, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export default function DataPage() {
  const { workspace, can } = useAuth()
  const workspaceId = workspace?.id
  const queryClient = useQueryClient()
  const fieldsQuery = useFields(workspaceId)

  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [sort, setSort] = useState('date')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Job | null>(null)
  const [toDelete, setToDelete] = useState<Job | null>(null)

  useEffect(() => setPage(1), [q, sort, order, workspaceId])

  const columns = useMemo(
    () =>
      (fieldsQuery.data ?? [])
        .filter((field) => field.table_position !== null)
        .sort((a, b) => (a.table_position ?? 0) - (b.table_position ?? 0)),
    [fieldsQuery.data],
  )

  const jobs = useQuery({
    queryKey: ['jobs', workspaceId, { q, sort, order, page }],
    queryFn: () => get<JobPage>(`/workspaces/${workspaceId}/jobs`, { q, sort, order, page, page_size: PAGE_SIZE }),
    enabled: !!workspaceId,
    placeholderData: (previous) => previous,
  })

  const remove = useMutation({
    mutationFn: (job: Job) => del(`/workspaces/${workspaceId}/jobs/${job.id}`),
    onSuccess: () => {
      setToDelete(null)
      setOpen(null)
      void queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] })
    },
  })

  const toggleSort = (key: string) => {
    if (sort === key) setOrder(order === 'asc' ? 'desc' : 'asc')
    else {
      setSort(key)
      setOrder('asc')
    }
  }

  const [exportError, setExportError] = useState<string | null>(null)
  const exportFile = useMutation({
    mutationFn: async (format: 'csv' | 'xlsx') => {
      const blob = await getBlob(`/workspaces/${workspaceId}/jobs/export`, { format, q, sort, order })
      saveBlob(blob, `jobs.${format}`)
    },
    onSuccess: () => setExportError(null),
    onError: (e) => setExportError((e as ApiError).message),
  })

  const total = jobs.data?.total ?? 0
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canEdit = can('job:update')
  const canDelete = can('job:delete')

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageTitle>Data</PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 md:max-w-[320px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <SearchIcon />
          </span>
          <label htmlFor="search" className="sr-only">
            Search jobs
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type to Search..."
            className="h-11 w-full rounded-lg border border-control bg-surface pl-10 pr-3 text-base md:text-sm"
          />
        </div>
        {can('job:export') && (
          <div className="ml-auto flex gap-2">
            <Button disabled={exportFile.isPending} onClick={() => exportFile.mutate('xlsx')}>
              <DownloadIcon /> Excel
            </Button>
            <Button disabled={exportFile.isPending} onClick={() => exportFile.mutate('csv')}>
              CSV
            </Button>
          </div>
        )}
      </div>

      {exportError && (
        <div className="mb-3">
          <Banner tone="error">{exportError}</Banner>
        </div>
      )}
      {(jobs.isError || fieldsQuery.isError) && (
        <Banner tone="error">
          {((jobs.error ?? fieldsQuery.error) as ApiError | null)?.message ?? 'Could not load jobs'}
        </Banner>
      )}

      <div className="overflow-auto rounded-xl border border-line bg-surface">
        <table className="min-w-max border-separate border-spacing-0 text-left">
          <caption className="sr-only">Jobs, newest first by default</caption>
          <thead>
            <tr>
              {columns.map((field, index) => {
                const active = sort === field.key
                const sticky = index === 0 ? 'sticky left-0 z-10 md:w-[124px] md:min-w-[124px]' : index === 1 ? 'md:sticky md:left-[124px] md:z-10' : ''
                return (
                  <th
                    key={field.id}
                    scope="col"
                    aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`border-b border-line bg-raised px-3 py-0 text-xs font-semibold text-muted ${sticky}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(field.key)}
                      className="flex h-11 cursor-pointer items-center gap-1 whitespace-nowrap font-semibold"
                    >
                      {columnHeader(field)}
                      <span aria-hidden="true" className="w-3 text-ink">
                        {active ? (order === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="border-b border-l border-line bg-raised px-3 text-xs font-semibold text-muted md:sticky md:right-0 md:z-10 md:shadow-[-8px_0_8px_-8px_rgba(18,23,28,0.25)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data?.items ?? []).map((job) => (
              <tr key={job.id} onClick={() => setOpen(job)} className="group cursor-pointer">
                {columns.map((field, index) => (
                  <Cell key={field.id} field={field} job={job} index={index} />
                ))}
                <td
                  onClick={(event) => event.stopPropagation()}
                  className="border-b border-l border-line bg-surface px-3 group-hover:bg-raised md:sticky md:right-0 md:z-[5] md:shadow-[-8px_0_8px_-8px_rgba(18,23,28,0.25)]"
                >
                  <div className="flex items-center gap-1 py-1">
                    {canEdit && (
                      <Link
                        to={`/jobs/${job.id}/edit`}
                        className="inline-flex h-9 items-center rounded-md border border-control bg-surface px-3 text-[13px] font-medium hover:bg-raised"
                      >
                        Edit
                      </Link>
                    )}
                    {canDelete && (
                      <Button small variant="ghost" className="text-bad" onClick={() => setToDelete(job)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {jobs.isLoading && (
          <div className="p-6">
            <Spinner label="Loading jobs" />
          </div>
        )}
        {jobs.data && jobs.data.items.length === 0 && (
          <div className="p-10 text-center">
            <p className="font-medium">{q ? `No jobs match “${q}”` : 'No jobs yet'}</p>
            <p className="mt-1 text-muted">
              {q ? 'Try a different word, or clear the search.' : 'Jobs your crew enters will show up here.'}
            </p>
            {!q && can('job:create') && (
              <Link to="/entry" className="mt-4 inline-flex h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white">
                Enter the first job
              </Link>
            )}
          </div>
        )}
      </div>

      {total > 0 && (
        <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted tabular" aria-live="polite">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <PagerButton disabled={page === 1} onClick={() => setPage(1)}>
              First
            </PagerButton>
            <PagerButton disabled={page === 1} onClick={() => setPage(page - 1)}>
              Prev
            </PagerButton>
            {pageNumbers(page, last).map((n) => (
              <PagerButton key={n} current={n === page} onClick={() => setPage(n)}>
                {n}
              </PagerButton>
            ))}
            <PagerButton disabled={page === last} onClick={() => setPage(page + 1)}>
              Next
            </PagerButton>
            <PagerButton disabled={page === last} onClick={() => setPage(last)}>
              Last
            </PagerButton>
          </div>
        </nav>
      )}

      {open && (
        <JobSheet
          job={open}
          fields={fieldsQuery.data ?? []}
          workspaceId={workspaceId!}
          onClose={() => setOpen(null)}
          onDelete={canDelete ? () => setToDelete(open) : undefined}
          canEdit={canEdit}
        />
      )}

      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        variant="dialog"
        title="Delete this job card?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="primary"
              className="!border-bad !bg-bad"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete)}
            >
              {remove.isPending ? 'Deleting…' : 'Delete job card'}
            </Button>
          </>
        }
      >
        <p>
          Job card <strong className="tabular">{toDelete?.values.job_no}</strong> will be removed from the Data table. Its number is not reused.
        </p>
        {remove.isError && (
          <div className="mt-3">
            <Banner tone="error">{(remove.error as ApiError).message}</Banner>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function PagerButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean; current?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-current={props.current ? 'page' : undefined}
      className={`h-10 min-w-10 cursor-pointer rounded-lg px-3 text-sm font-medium tabular disabled:cursor-default disabled:text-faint disabled:opacity-60 ${
        props.current ? 'bg-primary font-semibold text-white' : 'hover:bg-active'
      }`}
    >
      {props.children}
    </button>
  )
}

function Cell({ field, job, index }: { field: Field; job: Job; index: number }) {
  const value = job.values[field.key]
  const sticky =
    index === 0 ? 'sticky left-0 z-[5] bg-surface group-hover:bg-raised' : index === 1 ? 'md:sticky md:left-[124px] md:z-[5] bg-surface group-hover:bg-raised' : 'group-hover:bg-raised'
  let content: React.ReactNode
  if (field.key === 'status' && typeof value === 'string') content = <StatusPill status={value} />
  else if (field.key === 'job_no')
    content = <span className="rounded-md bg-active px-2 py-0.5 font-mono text-[13px] font-semibold tabular">{String(value ?? EMPTY)}</span>
  else {
    const text = displayValue(field, value)
    const mono = field.type === 'date'
    content = <span className={`${mono ? 'font-mono tabular' : ''} ${text === EMPTY ? 'text-faint' : ''}`}>{text}</span>
  }
  const wrap = field.type === 'longtext' ? 'max-w-[320px] min-w-[220px] truncate' : 'whitespace-nowrap'
  return (
    <td className={`h-12 border-b border-line px-3 ${wrap} ${sticky}`} title={field.type === 'longtext' ? displayValue(field, value) : undefined}>
      {content}
    </td>
  )
}

function JobSheet(props: {
  job: Job
  fields: Field[]
  workspaceId: string
  onClose: () => void
  onDelete?: () => void
  canEdit: boolean
}) {
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const shown = props.fields
    .filter((field) => (field.on_form || field.key === 'closed_at') && field.type !== 'photo')
    .sort((a, b) => a.position - b.position)
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={`Job card ${props.job.values.job_no}`}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={printing}
            onClick={async () => {
              setPrintError(null)
              setPrinting(true)
              try {
                const blob = await getBlob(`/workspaces/${props.workspaceId}/jobs/${props.job.id}/card`)
                saveBlob(blob, `job-card-${props.job.values.job_no}.pdf`)
              } catch (e) {
                setPrintError((e as ApiError).message)
              } finally {
                setPrinting(false)
              }
            }}
          >
            {printing ? 'Preparing…' : 'Job card PDF'}
          </Button>
          {props.canEdit && (
            <Link
              to={`/jobs/${props.job.id}/edit`}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white"
            >
              Edit
            </Link>
          )}
          {props.onDelete && (
            <Button variant="danger" onClick={props.onDelete}>
              Delete
            </Button>
          )}
        </>
      }
    >
      {printError && (
        <div className="mb-3">
          <Banner tone="error">{printError}</Banner>
        </div>
      )}
      <dl>
        {shown.map((field) => (
          <div key={field.id} className="flex justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
            <dt className="text-muted">{field.label}</dt>
            <dd className="text-right font-medium">
              {field.key === 'status' && typeof props.job.values.status === 'string' ? (
                <StatusPill status={props.job.values.status} />
              ) : (
                displayValue(field, props.job.values[field.key])
              )}
            </dd>
          </div>
        ))}
      </dl>
      {props.fields.some((field) => field.type === 'photo') && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Photos</h3>
          <PhotoGallery workspaceId={props.workspaceId} jobId={props.job.id} canEdit={false} />
        </div>
      )}
    </Dialog>
  )
}
