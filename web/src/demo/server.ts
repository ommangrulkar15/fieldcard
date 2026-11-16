/**
 * A tiny stand-in for the Fieldcard API, used only by the GitHub Pages demo.
 *
 * It answers the same paths with the same shapes and the same validation messages as the real
 * backend, so the real screens run unchanged. Everything lives in memory: nothing is sent
 * anywhere, nothing is stored, and a page reload (or the Reset button) starts over.
 * All people, places and amounts are invented.
 */

import { ApiError } from '../lib/errors'
import type { Field, Job, JobPage, Me, Photo, Value } from '../lib/types'
import fieldList from './fields.json'

type Role = 'admin' | 'supervisor' | 'crew'
type Values = Record<string, Value>
type Query = Record<string, string | number | undefined | null>
interface Opts {
  body?: unknown
  query?: Query
  blob?: boolean
}
interface Stored {
  id: string
  values: Values
  created_at: string
  updated_at: string
  deleted: boolean
}
interface StoredPhoto extends Photo {
  jobId: string
  blob: Blob
}

const FIELDS = fieldList as Field[]
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]))
const WORKSPACE_ID = 'demo-workspace'
const CORE = new Set(['date', 'job_no', 'description', 'status', 'closed_at'])
const MAX_PHOTOS = 5

const CREW = ['job:read', 'job:create', 'job:update']
const SUPERVISOR = [...CREW, 'job:delete', 'job:export']
const ADMIN = [...SUPERVISOR, 'fields:manage', 'users:manage', 'workspace:manage']
const PERMISSIONS: Record<Role, string[]> = { crew: CREW, supervisor: SUPERVISOR, admin: ADMIN }
const PEOPLE: Record<Role, { name: string; email: string }> = {
  admin: { name: 'Asha Demo', email: 'admin@demo.fieldcard.example' },
  supervisor: { name: 'Sam Demo', email: 'supervisor@demo.fieldcard.example' },
  crew: { name: 'Chris Demo', email: 'crew@demo.fieldcard.example' },
}

let role: Role = 'admin'
let jobs: Stored[] = []
let photos: StoredPhoto[] = []
let nextNo = 1
let counter = 0

// ---------------------------------------------------------------------------- seed

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORK = [
  'Electrical: replace blown fuse set on panel {n}',
  'Civil: repair cracked slab near gate {n}',
  'Mechanical: replace worn pump seal on unit {n}',
  'Plumbing: fix leaking joint on line {n}',
  'HVAC: service chiller unit {n}',
  'Painting: repaint boundary wall block {n}',
  'Welding: repair railing at bay {n}',
  'Electrical: install new meter box and service wire',
  'Civil: pour and cure footing for shed {n}',
  'Mechanical: align conveyor belt on line {n}',
  'Plumbing: replace overhead tank float valve',
  'Carpentry: refit site office door {n}',
]
const SECTIONS = ['Westgate', 'Pine Hill', 'Orchard Road', 'Maple Court', 'Harbor Lane', 'Lake View']
const AGENCIES = ['Brightline Works', 'Ember Contractors', 'Kestrel Services']

function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function newId(): string {
  counter += 1
  return `demo-${Date.now().toString(36)}-${counter}`
}

function searchText(values: Values): string {
  return Object.values(values)
    .filter((v) => typeof v !== 'boolean')
    .join(' ')
    .slice(0, 20000)
}

export function resetDemo(): void {
  photos = []
  jobs = []
  nextNo = 1
  const rng = mulberry32(7)
  const pick = <T,>(items: T[]): T => items[Math.floor(rng() * items.length)]
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  const count = 45
  const ago = Array.from({ length: count }, () => int(1, 90)).sort((a, b) => b - a)
  for (let i = 0; i < count; i++) {
    const closed = rng() < 0.6 || ago[i] > 45
    const values: Values = {
      date: isoDay(ago[i]),
      job_no: String(nextNo),
      description: pick(WORK).replace('{n}', String(int(10, 400))).replace('{m}', String(int(10, 400))),
      status: closed ? 'closed' : 'open',
      section: pick(SECTIONS),
      division: pick(['North', 'South']),
      subdivision: pick(['Block A', 'Block B', 'Block C']),
      dtc: `AT-${String(int(1, 90)).padStart(2, '0')}`,
      feeder_no: `U${int(1, 20)}`,
      agency_name: pick(AGENCIES),
    }
    if (closed) values.closed_at = isoDay(Math.max(0, ago[i] - int(1, 12)))
    if (rng() < 0.7) {
      values.mo_no = `Q-${int(1000, 9999)}`
      values.mo_amount = String(int(8, 240) * 500)
      values.wo_no = `WO-${int(100, 999)}`
      values.wo_amount = String(int(8, 240) * 450)
    }
    const stamp = new Date(`${values.date}T09:00:00`).toISOString()
    jobs.push({ id: newId(), values, created_at: stamp, updated_at: stamp, deleted: false })
    nextNo += 1
  }
}
resetDemo()

// ---------------------------------------------------------------------------- validation

/** Same rules and messages as the API's `coerce`. Returns null for "no value". */
function coerce(field: Field, raw: unknown): Value | null {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return null
  switch (field.type) {
    case 'photo':
      throw new Error('Photos are uploaded separately')
    case 'text':
    case 'longtext': {
      if (typeof raw !== 'string') throw new Error('Must be text')
      const value = raw.trim()
      const limit = field.type === 'longtext' ? 5000 : 200
      if (value.length > limit) throw new Error(`Must be at most ${limit} characters`)
      return value
    }
    case 'number': {
      if (typeof raw === 'boolean' || (typeof raw !== 'string' && typeof raw !== 'number')) throw new Error('Must be a number')
      const text = String(raw).trim()
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) throw new Error('Must be a number')
      const decimals = text.includes('.') ? text.split('.')[1].length : 0
      if (decimals > 4) throw new Error('Use at most 4 decimal places')
      const number = Number(text)
      if (Math.abs(number) > 999999999999.9999) throw new Error('Number is too large')
      return Object.is(number, -0) ? '0' : String(number)
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) throw new Error('Must be a date (YYYY-MM-DD)')
      const value = raw.trim()
      const parsed = new Date(`${value}T00:00:00Z`)
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error('Must be a date (YYYY-MM-DD)')
      }
      const year = Number(value.slice(0, 4))
      if (year < 1900 || year > 2100) throw new Error('Date is out of range')
      return value
    }
    case 'dropdown':
    case 'choice': {
      if (typeof raw !== 'string') throw new Error('Must be text')
      const value = raw.trim()
      if (field.options.some((o) => !o.archived && o.value === value)) return value
      if (field.type === 'dropdown' && field.config.allow_custom) {
        if (value.length > 200) throw new Error('Must be at most 200 characters')
        return value
      }
      throw new Error('Pick one of the listed options')
    }
    case 'yesno':
      if (typeof raw !== 'boolean') throw new Error('Must be yes or no')
      return raw
    default:
      throw new Error('Unsupported field type')
  }
}

function splitValues(input: Record<string, unknown>): { clean: Record<string, Value | null>; errors: Record<string, string> } {
  const clean: Record<string, Value | null> = {}
  const errors: Record<string, string> = {}
  for (const [key, raw] of Object.entries(input)) {
    const field = BY_KEY.get(key)
    if (!field) {
      errors[key] = 'Unknown field'
      continue
    }
    if (!field.on_form && key !== 'closed_at') {
      errors[key] = 'Set by the system'
      continue
    }
    try {
      let value = coerce(field, raw)
      if (value !== null && key === 'job_no') {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1 || n > 2_000_000_000) throw new Error('Must be a whole number from 1')
        value = String(n)
      }
      clean[key] = value
    } catch (problem) {
      errors[key] = (problem as Error).message
    }
  }
  return { clean, errors }
}

function today(): string {
  return isoDay(0)
}

// ---------------------------------------------------------------------------- jobs

function visible(job: Stored): Job {
  const values: Values = {}
  for (const field of FIELDS) {
    if (field.type === 'photo') continue
    const value = job.values[field.key]
    if (value !== undefined && value !== null && value !== '') values[field.key] = value
  }
  return { id: job.id, values, created_at: job.created_at, updated_at: job.updated_at }
}

function need(permission: string): void {
  if (!PERMISSIONS[role].includes(permission)) throw new ApiError(403, 'You do not have permission to do that')
}

function find(id: string): Stored {
  const job = jobs.find((j) => j.id === id && !j.deleted)
  if (!job) throw new ApiError(404, 'Job not found')
  return job
}

function createJob(input: unknown): Job {
  need('job:create')
  const body = (input as { values?: Record<string, unknown> } | undefined)?.values ?? {}
  const { clean, errors } = splitValues(body)
  for (const field of FIELDS) {
    if (field.required && field.on_form && field.key !== 'job_no' && (clean[field.key] ?? null) === null) {
      errors[field.key] ??= 'Required'
    }
  }
  if (Object.keys(errors).length) throw new ApiError(422, 'Validation failed', errors)

  const values: Values = {}
  for (const [key, value] of Object.entries(clean)) if (value !== null) values[key] = value
  let number = nextNo
  if (values.job_no !== undefined) {
    number = Number(values.job_no)
    if (jobs.some((j) => !j.deleted && Number(j.values.job_no) === number)) {
      throw new ApiError(409, `Job card number ${number} is already used`)
    }
    nextNo = Math.max(nextNo, number + 1)
  } else {
    nextNo += 1
  }
  values.job_no = String(number)
  if (values.status === 'closed') values.closed_at = String(values.closed_at ?? today())
  else delete values.closed_at
  const stamp = new Date().toISOString()
  const job: Stored = { id: newId(), values, created_at: stamp, updated_at: stamp, deleted: false }
  jobs.unshift(job)
  return visible(job)
}

function updateJob(id: string, input: unknown): Job {
  need('job:update')
  const job = find(id)
  const body = (input as { values?: Record<string, unknown> } | undefined)?.values ?? {}
  const { clean, errors } = splitValues(body)
  for (const [key, value] of Object.entries(clean)) {
    const field = BY_KEY.get(key)
    if (value === null && field && (field.required || (CORE.has(key) && key !== 'closed_at'))) errors[key] = 'Required'
  }
  if (Object.keys(errors).length) throw new ApiError(422, 'Validation failed', errors)
  if (clean.job_no) {
    const wanted = Number(clean.job_no)
    if (jobs.some((j) => j.id !== id && !j.deleted && Number(j.values.job_no) === wanted)) {
      throw new ApiError(409, `Job card number ${wanted} is already used`)
    }
    nextNo = Math.max(nextNo, wanted + 1)
  }
  const merged: Values = { ...job.values }
  for (const [key, value] of Object.entries(clean)) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  if (merged.status === 'closed') merged.closed_at = String(clean.closed_at ?? job.values.closed_at ?? today())
  else delete merged.closed_at
  job.values = merged
  job.updated_at = new Date().toISOString()
  return visible(job)
}

function sortValue(job: Stored, field: Field): string | number | null {
  const value = job.values[field.key]
  if (value === undefined || value === null || value === '') return null
  if (field.type === 'number') return Number(value)
  return typeof value === 'string' ? value.toLowerCase() : String(value)
}

function listJobs(query: Query = {}): JobPage {
  need('job:read')
  const q = String(query.q ?? '').trim().toLowerCase()
  const sortField = BY_KEY.get(String(query.sort ?? 'date'))
  if (!sortField || sortField.type === 'photo') throw new ApiError(422, 'Validation failed', { sort: `Unknown field '${query.sort}'` })
  const dir = query.order === 'asc' ? 1 : -1
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 25)))
  const page = Math.max(1, Number(query.page ?? 1))

  const rows = jobs
    .filter((j) => !j.deleted && (!q || searchText(j.values).toLowerCase().includes(q)))
    .sort((a, b) => {
      const x = sortValue(a, sortField)
      const y = sortValue(b, sortField)
      if (x === null && y !== null) return 1
      if (y === null && x !== null) return -1
      if (x !== null && y !== null && x !== y) return (x < y ? -1 : 1) * dir
      return Number(b.values.job_no) - Number(a.values.job_no)
    })
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize).map(visible),
    total: rows.length,
    page,
    page_size: pageSize,
  }
}

// ---------------------------------------------------------------------------- export

function shown(field: Field, value: Value | undefined): string {
  if (value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'date') return `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`
  if (field.key === 'status') return value.charAt(0).toUpperCase() + value.slice(1)
  return value
}

/** A spreadsheet would run a cell that starts with = + - @; an apostrophe makes it plain text. */
function safeCell(text: string): string {
  const start = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(start) ? `"${start.replaceAll('"', '""')}"` : start
}

function exportCsv(query: Query = {}): Blob {
  need('job:export')
  if (query.format === 'xlsx') {
    throw new ApiError(501, 'Excel export is part of the full app. CSV works in this demo.')
  }
  const columns = FIELDS.filter((f) => f.table_position !== null && f.type !== 'photo').sort(
    (a, b) => (a.table_position ?? 0) - (b.table_position ?? 0),
  )
  const all = listAll(query)
  const lines = [columns.map((c) => safeCell(c.table_label ?? c.label)).join(',')]
  for (const job of all) lines.push(columns.map((c) => safeCell(shown(c, job.values[c.key]))).join(','))
  return new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

function listAll(query: Query): Job[] {
  const out: Job[] = []
  for (let page = 1; ; page++) {
    const chunk = listJobs({ ...query, page, page_size: 100 })
    out.push(...chunk.items)
    if (out.length >= chunk.total) return out
  }
}

// ---------------------------------------------------------------------------- photos

function asPhoto(p: StoredPhoto): Photo {
  return { id: p.id, width: p.width, height: p.height, size_bytes: p.size_bytes, created_at: p.created_at }
}

async function addPhoto(jobId: string, body: unknown): Promise<Photo> {
  need('job:update')
  find(jobId)
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError(422, 'Validation failed', { file: 'The file is empty' })
  if (file.size > 8 * 1024 * 1024) throw new ApiError(422, 'Validation failed', { file: 'The photo is larger than 8 MB' })
  if (photos.filter((p) => p.jobId === jobId).length >= MAX_PHOTOS) {
    throw new ApiError(409, `A job can have at most ${MAX_PHOTOS} photos`)
  }
  let width = 0
  let height = 0
  try {
    const bitmap = await createImageBitmap(file)
    width = bitmap.width
    height = bitmap.height
    bitmap.close()
  } catch {
    throw new ApiError(422, 'Validation failed', { file: 'That file is not a readable photo' })
  }
  const stored: StoredPhoto = {
    id: newId(), jobId, blob: file, width, height, size_bytes: file.size, created_at: new Date().toISOString(),
  }
  photos.push(stored)
  return asPhoto(stored)
}

// ---------------------------------------------------------------------------- router

const IN_WORKSPACE = /^\/workspaces\/[^/]+(\/.*)$/

export async function demoApi(method: string, path: string, opts: Opts = {}): Promise<unknown> {
  await Promise.resolve() // keep the same async shape as a network call

  if (path === '/config') return { signup_enabled: false, demo_enabled: true }
  if (path === '/auth/demo') {
    const asked = (opts.body as { role?: string } | undefined)?.role
    if (asked !== 'admin' && asked !== 'supervisor' && asked !== 'crew') throw new ApiError(404, 'Unknown demo role')
    role = asked
    return { access_token: `demo-${asked}`, token_type: 'bearer', expires_in: 900 }
  }
  if (path === '/auth/me') {
    const person = PEOPLE[role]
    const me: Me = {
      user: { id: `user-${role}`, email: person.email, name: person.name },
      workspaces: [{ id: WORKSPACE_ID, name: 'Demo Electricals', template: 'electrical', role, permissions: PERMISSIONS[role] }],
    }
    return me
  }
  if (path === '/auth/logout') return undefined
  if (path.startsWith('/auth/')) throw new ApiError(403, 'Sign-in is switched off in the demo. Pick a role instead')

  const inner = IN_WORKSPACE.exec(path)?.[1]
  if (!inner) throw new ApiError(404, 'Not found')

  if (inner === '/fields' && method === 'GET') return FIELDS
  if (inner === '/jobs' && method === 'GET') return listJobs(opts.query)
  if (inner === '/jobs' && method === 'POST') return createJob(opts.body)
  if (inner === '/jobs/export' && method === 'GET') return exportCsv(opts.query)

  const job = /^\/jobs\/([^/]+)(\/.*)?$/.exec(inner)
  if (job) {
    const [, id, rest] = job
    if (!rest) {
      if (method === 'GET') {
        need('job:read')
        return visible(find(id))
      }
      if (method === 'PATCH') return updateJob(id, opts.body)
      if (method === 'DELETE') {
        need('job:delete')
        find(id).deleted = true
        photos = photos.filter((p) => p.jobId !== id)
        return undefined
      }
    }
    if (rest === '/card') throw new ApiError(501, 'The printable PDF job card is part of the full app.')
    if (rest === '/photos') {
      if (method === 'GET') {
        need('job:read')
        find(id)
        return photos.filter((p) => p.jobId === id).map(asPhoto)
      }
      if (method === 'POST') return addPhoto(id, opts.body)
    }
    const one = /^\/photos\/([^/]+)(\/image)?$/.exec(rest ?? '')
    if (one) {
      const photo = photos.find((p) => p.id === one[1] && p.jobId === id)
      if (!photo) throw new ApiError(404, 'Photo not found')
      if (one[2] && method === 'GET') return photo.blob
      if (!one[2] && method === 'DELETE') {
        need('job:update')
        photos = photos.filter((p) => p.id !== photo.id)
        return undefined
      }
    }
  }
  throw new ApiError(403, 'This part of Fieldcard is in the full app, not the demo')
}
