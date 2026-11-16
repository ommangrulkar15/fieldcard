import { ApiError, DEMO } from './errors'
import { demoApi } from '../demo/server'

const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null

export const SIGNED_OUT_EVENT = 'fieldcard:signed-out'

export { ApiError }

export function setAccessToken(token: string | null) {
  accessToken = token
}

type Query = Record<string, string | number | undefined | null>

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${BASE}${path}${qs ? `?${qs}` : ''}`
}

async function send(method: string, path: string, body?: unknown, query?: Query): Promise<Response> {
  const headers: Record<string, string> = { 'X-Fieldcard': '1' }
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return fetch(buildUrl(path, query), {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  })
}

async function attemptRefresh(): Promise<boolean> {
  const response = await send('POST', '/auth/refresh')
  if (!response.ok) return false
  const data = (await response.json()) as { access_token: string }
  accessToken = data.access_token
  return true
}

/** Ask for a new access token using the httpOnly refresh cookie. One call at a time.
 *  A second browser tab may have just rotated the cookie, so a failure is retried once. */
export function refreshSession(): Promise<boolean> {
  if (DEMO) {
    accessToken = accessToken ?? 'demo-admin'
    return Promise.resolve(true)
  }
  if (!refreshing) {
    refreshing = (async () => {
      try {
        if (await attemptRefresh()) return true
        await new Promise((resolve) => setTimeout(resolve, 400))
        return await attemptRefresh()
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

async function toError(response: Response): Promise<ApiError> {
  let detail = 'Something went wrong. Try again'
  let errors: Record<string, string> = {}
  try {
    const data = (await response.json()) as { detail?: unknown; errors?: Record<string, string> }
    if (typeof data.detail === 'string') detail = data.detail
    if (data.errors) errors = data.errors
    if (response.status === 422 && !data.errors && Array.isArray(data.detail)) detail = 'Check the form and try again'
  } catch {
    /* keep the generic message */
  }
  return new ApiError(response.status, detail, errors)
}

export async function api<T>(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Query; blob?: boolean } = {},
): Promise<T> {
  if (DEMO) return (await demoApi(method, path, opts)) as T
  let response: Response
  try {
    response = await send(method, path, opts.body, opts.query)
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection, or wait a minute if it was idle')
  }
  if (response.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      response = await send(method, path, opts.body, opts.query)
    } else {
      accessToken = null
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
  }
  if (!response.ok) throw await toError(response)
  if (response.status === 204) return undefined as T
  if (opts.blob) return (await response.blob()) as T
  return (await response.json()) as T
}

export const get = <T,>(path: string, query?: Query) => api<T>('GET', path, { query })
export const post = <T,>(path: string, body?: unknown) => api<T>('POST', path, { body: body ?? {} })
export const patch = <T,>(path: string, body: unknown) => api<T>('PATCH', path, { body })
export const del = (path: string) => api<void>('DELETE', path)

export const upload = <T,>(path: string, file: Blob, name: string) => {
  const form = new FormData()
  form.append('file', file, name)
  return api<T>('POST', path, { body: form })
}
/** Images need the access token, so they are fetched as blobs instead of used as <img src>. */
export const getBlob = (path: string, query?: Query) => api<Blob>('GET', path, { query, blob: true })

/** Save a blob the browser would otherwise just display. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
