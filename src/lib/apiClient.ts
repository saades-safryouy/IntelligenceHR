export const isApiDataMode = import.meta.env.VITE_DATA_MODE === 'api' // Removed hardcoded `|| true`

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type ApiEnvelope<T> = { data: T }

function csrfToken(): string | undefined {
  const cookie = document.cookie.split('; ').find((value) => value.startsWith('XSRF-TOKEN='))
  return cookie ? decodeURIComponent(cookie.slice('XSRF-TOKEN='.length)) : undefined
}

async function initializeCsrf(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/sanctum/csrf-cookie`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new ApiError('Could not initialize the secure session. Try again.', response.status)
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const body = payload as { message?: unknown; errors?: Record<string, unknown> }
  const firstError = body.errors ? Object.values(body.errors).flat().find((error) => typeof error === 'string') : undefined
  if (typeof firstError === 'string') return firstError
  return typeof body.message === 'string' ? body.message : fallback
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body !== undefined && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await initializeCsrf()
    const token = csrfToken()
    if (token) headers.set('X-XSRF-TOKEN', token)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })
  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('Content-Type') || ''
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, `The API request failed (${response.status}).`), response.status)
  }

  return payload as T
}

export async function apiData<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiRequest<ApiEnvelope<T>>(path, options)
  return response.data
}

export async function apiUpload<T>(
  path: string,
  body: FormData,
  onProgress?: (percentage: number) => void,
): Promise<T> {
  await initializeCsrf()
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${apiBaseUrl}${path}`)
    request.withCredentials = true
    request.setRequestHeader('Accept', 'application/json')
    const token = csrfToken()
    if (token) request.setRequestHeader('X-XSRF-TOKEN', token)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    request.onerror = () => reject(new ApiError('The upload could not be completed.', 0))
    request.onload = () => {
      const contentType = request.getResponseHeader('Content-Type') || ''
      let payload: unknown = request.responseText
      if (contentType.includes('application/json')) {
        try {
          payload = JSON.parse(request.responseText) as unknown
        } catch {
          reject(new ApiError('The server returned an invalid response.', request.status))
          return
        }
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(errorMessage(payload, `The API request failed (${request.status}).`), request.status))
        return
      }
      resolve(payload as T)
    }
    request.send(body)
  })
}

export async function apiFile(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: { Accept: '*/*' },
  })
  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') || ''
    const payload: unknown = contentType.includes('application/json')
      ? await response.json()
      : await response.text()
    throw new ApiError(errorMessage(payload, `The API request failed (${response.status}).`), response.status)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? 'document'
  return { blob: await response.blob(), filename }
}
