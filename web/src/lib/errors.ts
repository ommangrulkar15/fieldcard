export class ApiError extends Error {
  status: number
  errors: Record<string, string>

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

/** True in the GitHub Pages build: the same screens run against an in-browser fake instead of the API. */
export const DEMO: boolean = import.meta.env.VITE_DEMO === '1'
