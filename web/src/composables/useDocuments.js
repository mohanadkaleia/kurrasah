/**
 * useDocuments -- reactive state + async methods over the REST API.
 *
 * Mirrors the endpoints in `../api/documents.js`. Exposes reactive refs
 * (`documents`, `currentDocument`, `versions`, `loading`, `error`) plus a
 * `debouncedUpdate` helper that coalesces rapid edits before hitting the
 * backend — keystrokes flood this, so callers use the debounced path
 * instead of `update()` directly for content/title edits.
 *
 * All methods set `error` on failure and re-throw so the view can show
 * a toast without losing the original error shape.
 */

import { ref, shallowRef } from 'vue'
import * as api from '../api/documents.js'

export function useDocuments() {
  /** List of document summaries from `GET /api/documents`. */
  const documents = ref([])

  /** Currently loaded full document (from `GET /api/documents/:id`). */
  const currentDocument = shallowRef(null)

  /** Version list for `currentDocument`, or the last doc for which
   *  `loadVersions` was called. */
  const versions = ref([])

  /** True while any async method is in flight. */
  const loading = ref(false)

  /** Latest error (ApiError or generic Error), cleared by the next call. */
  const error = ref(null)

  /**
   * Pending debounced patches keyed by document id. Each entry holds the
   * merged patch (latest values win per field), the timer id, and the
   * Promise wiring for the currently-queued flush so callers can await
   * completion if they need to.
   *
   * Shape:
   *   {
   *     [docId]: {
   *       patch: { title?, content_md? },
   *       timer: TimeoutID | null,
   *       promise: Promise,
   *       resolve: (doc) => void,
   *       reject: (err) => void,
   *     }
   *   }
   */
  const debouncers = new Map()

  function clearError() { error.value = null }

  function setError(err) {
    error.value = err
    // Re-throw — callers decide whether to swallow or toast.
    throw err
  }

  async function guarded(fn) {
    loading.value = true
    clearError()
    try {
      return await fn()
    } catch (err) {
      setError(err)
    } finally {
      loading.value = false
    }
  }

  // --- CRUD ----------------------------------------------------------------

  async function loadDocuments() {
    return guarded(async () => {
      const list = await api.listDocuments()
      documents.value = Array.isArray(list) ? list : []
      return documents.value
    })
  }

  async function load(id) {
    return guarded(async () => {
      const doc = await api.getDocument(id)
      currentDocument.value = doc
      return doc
    })
  }

  async function create(payload = {}) {
    return guarded(async () => {
      const doc = await api.createDocument(payload)
      // Optimistically prepend to the summary list so home view reflects
      // the new doc if the user navigates back without a re-fetch.
      documents.value = [
        { id: doc.id, title: doc.title, updated_at: doc.updated_at },
        ...documents.value,
      ]
      return doc
    })
  }

  async function update(id, patch) {
    return guarded(async () => {
      const doc = await api.updateDocument(id, patch)
      // Keep currentDocument synced when the user edits it directly.
      if (currentDocument.value && currentDocument.value.id === id) {
        currentDocument.value = { ...currentDocument.value, ...doc }
      }
      // Update the summary in the list if present.
      const idx = documents.value.findIndex((d) => d.id === id)
      if (idx !== -1) {
        documents.value[idx] = {
          ...documents.value[idx],
          title: doc.title,
          updated_at: doc.updated_at,
        }
      }
      return doc
    })
  }

  async function remove(id) {
    return guarded(async () => {
      await api.deleteDocument(id)
      documents.value = documents.value.filter((d) => d.id !== id)
      if (currentDocument.value && currentDocument.value.id === id) {
        currentDocument.value = null
      }
      return true
    })
  }

  // --- Versions ------------------------------------------------------------

  async function loadVersions(id) {
    return guarded(async () => {
      const list = await api.listVersions(id)
      versions.value = Array.isArray(list) ? list : []
      return versions.value
    })
  }

  async function saveVersion(id, label = null) {
    return guarded(async () => {
      const version = await api.createVersion(id, { label })
      versions.value = [version, ...versions.value]
      return version
    })
  }

  async function restore(id, versionId) {
    return guarded(async () => {
      const doc = await api.restoreVersion(id, versionId)
      if (currentDocument.value && currentDocument.value.id === id) {
        currentDocument.value = { ...currentDocument.value, ...doc }
      }
      return doc
    })
  }

  // --- Debounced update ----------------------------------------------------

  /**
   * Queue a partial update that coalesces rapid calls. The latest value
   * per field wins; the flush happens `delayMs` after the last call for
   * this document id.
   *
   * Returns a Promise that resolves when the queued write lands, or
   * rejects with an ApiError. Subsequent calls before the flush return
   * the same shared Promise, so many keystrokes produce one round-trip.
   */
  function debouncedUpdate(id, patch, { delayMs = 500 } = {}) {
    let entry = debouncers.get(id)
    if (!entry) {
      let resolvePromise
      let rejectPromise
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve
        rejectPromise = reject
      })
      entry = {
        patch: {},
        timer: null,
        promise,
        resolve: resolvePromise,
        reject: rejectPromise,
      }
      debouncers.set(id, entry)
    }

    // Merge the incoming patch: later calls override earlier values on
    // a per-field basis.
    entry.patch = { ...entry.patch, ...patch }

    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => flushUpdate(id), delayMs)
    return entry.promise
  }

  /**
   * Flush the debounced patch for `id` immediately. Useful on unmount
   * or before navigation so the last edit is not lost.
   */
  async function flushUpdate(id) {
    const entry = debouncers.get(id)
    if (!entry) return null

    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }

    // Detach the entry before awaiting so a new debouncedUpdate() call
    // while this request is in flight starts a fresh queue.
    debouncers.delete(id)
    const { patch, resolve, reject } = entry

    if (!patch || Object.keys(patch).length === 0) {
      resolve(null)
      return null
    }

    try {
      const doc = await update(id, patch)
      resolve(doc)
      return doc
    } catch (err) {
      reject(err)
      throw err
    }
  }

  /** Flush all pending debounces. Call on view unmount. */
  async function flushAllUpdates() {
    const ids = Array.from(debouncers.keys())
    // Best-effort: swallow individual failures so one failing doc
    // does not block others.
    const results = await Promise.allSettled(ids.map((id) => flushUpdate(id)))
    return results
  }

  return {
    // State
    documents,
    currentDocument,
    versions,
    loading,
    error,

    // CRUD
    loadDocuments,
    load,
    create,
    update,
    remove,

    // Versions
    loadVersions,
    saveVersion,
    restore,

    // Debounced edit path
    debouncedUpdate,
    flushUpdate,
    flushAllUpdates,
  }
}
