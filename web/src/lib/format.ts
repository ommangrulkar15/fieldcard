import type { Field, Value } from './types'

export const EMPTY = '—'

/** 2026-10-30 -> 30-10-2026, the format the reference client uses. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}-${m}-${y}` : iso
}

export function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function optionLabel(field: Field, value: string): string {
  return field.key === 'status' ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

/** Whole numbers stay whole; anything with decimals shows at least two, so 1250.5 reads 1,250.50. */
function formatNumber(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  const decimals = raw.split('.')[1]?.length ?? 0
  const digits = decimals === 0 ? 0 : Math.min(4, Math.max(2, decimals))
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Text for a stored value, for tables and detail views. Missing values show an em dash. */
export function displayValue(field: Field, value: Value | undefined): string {
  if (value === undefined || value === '') return EMPTY
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'date') return formatDate(value)
  if (field.type === 'number' && field.key !== 'job_no') {
    return formatNumber(value)
  }
  if (field.type === 'choice') return optionLabel(field, value)
  return value
}

export function columnHeader(field: Field): string {
  return field.table_label ?? field.label
}
