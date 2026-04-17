/**
 * REST client for the document API.
 *
 * Thin wrapper around `fetch`. One async function per endpoint. All
 * functions throw an `ApiError` on non-2xx responses so callers can
 * distinguish network failures from API-level errors.
 *
 * The base URL is read from `import.meta.env.VITE_API_BASE`; if unset,
 * the empty string is used so the Vite dev server's `/api` proxy can
 * forward requests to the Flask backend without CORS.
 */

const BASE = import.meta.env.VITE_API_BASE || ''

/**
 * Error thrown for any non-2xx HTTP response. Callers can switch on
 * `.status` (HTTP) or `.code` (API error code from `{error, code}`).
 */
export class ApiError extends Error {
  constructor({ status, code, error }) {
    super(error || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code || null
    this.error = error || null
  }
}

/**
 * Low-level fetch helper. Serializes JSON bodies, checks status, and
 * returns the parsed response. `204 No Content` returns `null`.
 */
async function request(path, { method = 'GET', body } = {}) {
  const init = { method, headers: {} }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch (err) {
    // Network failure, server unreachable, CORS, etc.
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      error: err?.message || 'Network request failed',
    })
  }

  if (response.status === 204) return null

  let payload = null
  // Guard: error responses with empty body, or non-JSON bodies, should
  // not crash the client.
  const text = await response.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.code || null,
      error: payload?.error || response.statusText,
    })
  }
  return payload
}

// --- Documents --------------------------------------------------------------

/** GET /api/documents → [{id, title, updated_at}] */
export function listDocuments() {
  return request('/api/documents')
}

/** POST /api/documents → created document */
export function createDocument({ title = '', content_md = '' } = {}) {
  return request('/api/documents', {
    method: 'POST',
    body: { title, content_md },
  })
}

/** GET /api/documents/:id → full document, or throws ApiError(404) */
export function getDocument(id) {
  return request(`/api/documents/${encodeURIComponent(id)}`)
}

/**
 * PATCH /api/documents/:id → updated document. `patch` may include any
 * subset of `{title, content_md}`; undefined keys are stripped so the
 * server sees only the fields the caller intends to change.
 */
export function updateDocument(id, patch) {
  const body = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.content_md !== undefined) body.content_md = patch.content_md
  return request(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  })
}

/** DELETE /api/documents/:id → null on success, throws on 404 */
export function deleteDocument(id) {
  return request(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// --- Versions ---------------------------------------------------------------

/** GET /api/documents/:id/versions → [{id, label, created_at}] */
export function listVersions(id) {
  return request(`/api/documents/${encodeURIComponent(id)}/versions`)
}

/** POST /api/documents/:id/versions → created version summary */
export function createVersion(id, { label = null } = {}) {
  return request(`/api/documents/${encodeURIComponent(id)}/versions`, {
    method: 'POST',
    body: { label },
  })
}

/** POST /api/documents/:id/versions/:versionId/restore → restored doc */
export function restoreVersion(id, versionId) {
  return request(
    `/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(
      versionId,
    )}/restore`,
    { method: 'POST' },
  )
}
