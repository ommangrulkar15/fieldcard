import type { Field, Value } from '../lib/types'

interface Props {
  field: Field
  value: Value | undefined
  error?: string
  placeholder?: string
  onChange: (value: Value) => void
}

const CONTROL =
  'w-full rounded-lg border bg-surface px-3 text-base md:text-sm focus-visible:outline-2 focus-visible:outline-offset-1'

/** One input per field type. 16px text on phones stops iOS zooming into the field. */
export default function FieldInput({ field, value, error, placeholder, onChange }: Props) {
  const id = `f-${field.key}`
  const border = error ? 'border-bad' : 'border-control'
  const describedBy = error ? `${id}-error` : undefined
  const text = typeof value === 'string' ? value : ''
  const common = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const

  let control: React.ReactNode
  switch (field.type) {
    case 'longtext':
      control = (
        <textarea
          {...common}
          rows={3}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROL} ${border} min-h-24 py-2`}
        />
      )
      break
    case 'number':
      control = (
        <input
          {...common}
          type="text"
          placeholder={placeholder}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROL} ${border} h-11 tabular`}
        />
      )
      break
    case 'date':
      control = (
        <input
          {...common}
          type="date"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROL} ${border} h-11`}
        />
      )
      break
    case 'dropdown': {
      const options = field.options.filter((option) => !option.archived || option.value === text)
      control = (
        <select
          {...common}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROL} ${border} h-11`}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value}
              {option.archived ? ' (retired)' : ''}
            </option>
          ))}
        </select>
      )
      break
    }
    case 'choice':
      control = <ChoiceInput field={field} text={text} error={!!error} onChange={onChange} describedBy={describedBy} />
      break
    case 'yesno':
      control = (
        <div role="group" aria-labelledby={`${id}-label`} className="flex gap-2">
          {[
            { label: 'Yes', on: true },
            { label: 'No', on: false },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={value === option.on}
              onClick={() => onChange(option.on)}
              className={`h-11 min-w-20 cursor-pointer rounded-lg border px-4 font-medium ${
                value === option.on ? 'border-primary bg-primary text-white' : `${border} bg-surface hover:bg-raised`
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )
      break
    default:
      control = (
        <input
          {...common}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROL} ${border} h-11`}
        />
      )
  }

  return (
    <div className="mb-4 last:mb-0">
      <label id={`${id}-label`} htmlFor={id} className="mb-1 block text-sm font-medium">
        {field.label}
        {field.required && (
          <span className="text-bad" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

function ChoiceInput(props: {
  field: Field
  text: string
  error: boolean
  describedBy?: string
  onChange: (value: string) => void
}) {
  const { field, text } = props
  const options = field.options.filter((option) => !option.archived || option.value === text)
  const known = options.some((option) => option.value === text)
  const custom = field.config.allow_custom
  return (
    <div>
      <div role="group" aria-labelledby={`f-${field.key}-label`} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={text === option.value}
            onClick={() => props.onChange(text === option.value ? '' : option.value)}
            className={`h-11 cursor-pointer rounded-lg border px-4 font-medium ${field.key === 'status' ? 'capitalize' : ''} ${
              text === option.value ? 'border-primary bg-primary text-white' : 'border-control bg-surface hover:bg-raised'
            }`}
          >
            {option.value}
          </button>
        ))}
      </div>
      {custom && (
        <input
          id={`f-${field.key}`}
          type="text"
          placeholder="Or type another…"
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.describedBy}
          value={known ? '' : text}
          onChange={(event) => props.onChange(event.target.value)}
          className={`${CONTROL} mt-2 h-11 ${props.error ? 'border-bad' : 'border-control'}`}
        />
      )}
    </div>
  )
}
