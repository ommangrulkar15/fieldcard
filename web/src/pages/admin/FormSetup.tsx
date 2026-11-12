import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Dialog, Spinner } from '../../components/ui'
import { TextField } from '../AuthPages'
import { ApiError, get, patch, post } from '../../lib/api'
import type { Field, FieldType } from '../../lib/types'

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  longtext: 'Long text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  choice: 'Choice buttons',
  yesno: 'Yes / No',
  photo: 'Photos',
}
const CREATABLE: FieldType[] = ['text', 'longtext', 'number', 'date', 'dropdown', 'choice', 'yesno']
const HAS_OPTIONS = (type: string) => type === 'dropdown' || type === 'choice'

function slugify(label: string, taken: Set<string>): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34)
  if (!/^[a-z]/.test(base)) base = `f_${base}`
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`
  return key
}

export default function FormSetup({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Field | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = useQuery({
    queryKey: ['fields', workspaceId, 'all'],
    queryFn: () => get<Field[]>(`/workspaces/${workspaceId}/fields`, { include_hidden: 'true' }),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fields', workspaceId] })

  const reorder = useMutation({
    mutationFn: (ids: string[]) => post<Field[]>(`/workspaces/${workspaceId}/fields/reorder`, { ids }),
    onSuccess: refresh,
    onError: (e) => setError((e as ApiError).message),
  })
  const toggleHidden = useMutation({
    mutationFn: (field: Field) => patch<Field>(`/workspaces/${workspaceId}/fields/${field.id}`, { is_hidden: !field.is_hidden }),
    onSuccess: refresh,
    onError: (e) => setError((e as ApiError).message),
  })

  const ordered = useMemo(() => (fields.data ?? []).filter((field) => field.type !== 'photo'), [fields.data])
  const move = (index: number, delta: number) => {
    const ids = (fields.data ?? []).map((field) => field.id)
    const a = ids.indexOf(ordered[index].id)
    const b = ids.indexOf(ordered[index + delta].id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    setError(null)
    reorder.mutate(ids)
  }

  if (fields.isLoading) return <Spinner label="Loading fields" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-muted">
          Change what crews fill in. Hiding a field keeps its old data. Names can change, types cannot.
        </p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add field
        </Button>
      </div>
      {error && (
        <div className="mb-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {ordered.map((field, index) => (
          <li key={field.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`Move ${field.label} up`}
                disabled={index === 0 || reorder.isPending}
                onClick={() => move(index, -1)}
                className="grid h-6 w-11 cursor-pointer place-items-center rounded hover:bg-active disabled:cursor-default disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Move ${field.label} down`}
                disabled={index === ordered.length - 1 || reorder.isPending}
                onClick={() => move(index, 1)}
                className="grid h-6 w-11 cursor-pointer place-items-center rounded hover:bg-active disabled:cursor-default disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <div className={`min-w-0 flex-1 ${field.is_hidden ? 'opacity-60' : ''}`}>
              <p className="truncate font-medium">
                {field.label}
                {field.required && <span className="text-bad"> *</span>}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="rounded bg-active px-1.5 py-0.5 font-medium">{TYPE_LABELS[field.type]}</span>
                {field.is_core && <span>Core field</span>}
                {field.is_hidden && <span className="font-semibold text-warn-ink">Hidden</span>}
                {field.table_position !== null && <span>In table</span>}
              </p>
            </div>
            <Button small variant="secondary" onClick={() => setEditing(field)}>
              Edit
            </Button>
            {!field.is_core && (
              <Button small variant="ghost" disabled={toggleHidden.isPending} onClick={() => toggleHidden.mutate(field)}>
                {field.is_hidden ? 'Restore' : 'Hide'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <FieldDialog
          workspaceId={workspaceId}
          existing={fields.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void refresh()
          }}
        />
      )}
      {editing && (
        <FieldDialog
          key={editing.id}
          workspaceId={workspaceId}
          existing={fields.data ?? []}
          field={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

function FieldDialog(props: {
  workspaceId: string
  existing: Field[]
  field?: Field
  onClose: () => void
  onSaved: () => void
}) {
  const { field } = props
  const [label, setLabel] = useState(field?.label ?? '')
  const [tableLabel, setTableLabel] = useState(field?.table_label ?? '')
  const [type, setType] = useState<FieldType>(field?.type ?? 'text')
  const [required, setRequired] = useState(field?.required ?? false)
  const [inTable, setInTable] = useState(field ? field.table_position !== null : true)
  const [allowCustom, setAllowCustom] = useState(field?.config.allow_custom ?? false)
  const [options, setOptions] = useState((field?.options ?? []).filter((o) => !o.archived).map((o) => o.value).join('\n'))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const optionList = options.split('\n').map((line) => line.trim()).filter(Boolean)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage('')
    const tablePositions = props.existing.map((f) => f.table_position ?? 0)
    const body: Record<string, unknown> = {
      label,
      table_label: tableLabel.trim() || null,
      required,
      ...(HAS_OPTIONS(type) ? { options: optionList, config: { allow_custom: type === 'choice' && allowCustom } } : {}),
    }
    try {
      if (field) {
        if (inTable !== (field.table_position !== null)) {
          body.table_position = inTable ? Math.max(0, ...tablePositions) + 1 : null
        }
        if (field.is_core) delete body.required
        await patch(`/workspaces/${props.workspaceId}/fields/${field.id}`, body)
      } else {
        await post(`/workspaces/${props.workspaceId}/fields`, {
          ...body,
          key: slugify(label || 'field', new Set(props.existing.map((f) => f.key))),
          type,
          table_position: inTable ? Math.max(0, ...tablePositions) + 1 : null,
        })
      }
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
      title={field ? `Edit “${field.label}”` : 'Add a field'}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" form="field-form" variant="primary" className="flex-1" disabled={busy}>
            {busy ? 'Saving…' : field ? 'Save changes' : 'Add field'}
          </Button>
        </>
      }
    >
      <form id="field-form" onSubmit={submit} noValidate>
        {message && (
          <div className="mb-3">
            <Banner tone="error">{message}</Banner>
          </div>
        )}
        <TextField id="fd-label" label="Label on the form" value={label} onChange={setLabel} error={errors.label ?? errors.key} />
        <TextField
          id="fd-table"
          label="Column name in the Data table"
          value={tableLabel}
          onChange={setTableLabel}
          required={false}
          hint="Leave empty to use the label."
        />
        <div className="mb-4">
          <label htmlFor="fd-type" className="mb-1 block text-sm font-medium">
            Type
          </label>
          {field ? (
            <p id="fd-type" className="flex h-11 items-center rounded-lg bg-raised px-3 text-muted">
              {TYPE_LABELS[field.type]} (locked after creation)
            </p>
          ) : (
            <select
              id="fd-type"
              value={type}
              onChange={(event) => setType(event.target.value as FieldType)}
              className="h-11 w-full rounded-lg border border-control bg-surface px-3 text-base md:text-sm"
            >
              {CREATABLE.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          )}
          {errors.type && <p className="mt-1 text-sm text-bad">{errors.type}</p>}
        </div>
        {HAS_OPTIONS(type) && (
          <div className="mb-4">
            <label htmlFor="fd-options" className="mb-1 block text-sm font-medium">
              Options, one per line
            </label>
            <textarea
              id="fd-options"
              rows={5}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              aria-invalid={errors.options ? true : undefined}
              className={`w-full rounded-lg border bg-surface px-3 py-2 text-base md:text-sm ${errors.options ? 'border-bad' : 'border-control'}`}
            />
            {errors.options ? (
              <p className="mt-1 text-sm text-bad">{errors.options}</p>
            ) : (
              field && <p className="mt-1 text-xs text-muted">Removed options are retired, not deleted. Old jobs keep them.</p>
            )}
          </div>
        )}
        {type === 'choice' && (
          <Check id="fd-custom" checked={allowCustom} onChange={setAllowCustom} label="Let crews type their own value" />
        )}
        {!field?.is_core && <Check id="fd-required" checked={required} onChange={setRequired} label="Required" />}
        <Check id="fd-intable" checked={inTable} onChange={setInTable} label="Show as a column in the Data table" />
      </form>
    </Dialog>
  )
}

function Check(props: { id: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label htmlFor={props.id} className="mb-1 flex min-h-11 cursor-pointer items-center gap-3">
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="size-5 accent-[#15191E]"
      />
      {props.label}
    </label>
  )
}
