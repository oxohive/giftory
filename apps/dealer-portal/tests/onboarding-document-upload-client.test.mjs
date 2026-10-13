import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Exercises documentUpload.ts's client-side upload wrapper — the piece that needs
 * `XMLHttpRequest` for upload progress (`fetch` has no portable upload-progress event), which
 * does not exist as a Node global. A minimal fake `XMLHttpRequest` stands in here, driven
 * exactly the way a real browser XHR would drive the real code (`open`/`send`/`upload.onprogress`
 * /`onload`/`onerror`/`onabort`/`abort`), so this is testing the real resolve/reject/progress
 * wiring in documentUpload.ts, not a re-implementation of it. `FormData`/`File`/`DOMException`/
 * `AbortController` are real Node globals already; only `XMLHttpRequest` needs a stand-in.
 */

class FakeXHR {
  constructor() {
    this.upload = {}
    this._headers = {}
  }
  open(method, url) {
    this.method = method
    this.url = url
  }
  getResponseHeader(name) {
    return this._headers[name.toLowerCase()] ?? null
  }
  send(body) {
    FakeXHR.lastInstance = this
    this.sentBody = body
  }
  abort() {
    this.aborted = true
    this.onabort?.()
  }
  // Test helpers below — not part of the real XHR surface, used to drive the fake from tests.
  _respond(status, bodyText, headers = {}) {
    this.status = status
    this.responseText = bodyText
    this._headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    this.onload?.()
  }
  _progress(loaded, total) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  _networkError() {
    this.onerror?.()
  }
}

async function withFakeXHR(run) {
  const original = globalThis.XMLHttpRequest
  globalThis.XMLHttpRequest = FakeXHR
  try {
    return await run()
  } finally {
    globalThis.XMLHttpRequest = original
  }
}

test('uploadKycDocument resolves with the real backend response on a genuine 2xx', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  await withFakeXHR(async () => {
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file })
    // Give the FakeXHR constructor/send a tick to run and register itself.
    await new Promise((r) => setTimeout(r, 0))
    FakeXHR.lastInstance._respond(201, JSON.stringify({ id: 'doc-9', documentType: 'gst_certificate', fileName: 'gst.pdf' }))
    const result = await promise
    assert.deepEqual(result, { id: 'doc-9', documentType: 'gst_certificate', fileName: 'gst.pdf' })
  })
})

test('uploadKycDocument posts to the dedicated route with a real multipart FormData body', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  await withFakeXHR(async () => {
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file })
    await new Promise((r) => setTimeout(r, 0))
    const xhr = FakeXHR.lastInstance
    assert.equal(xhr.method, 'POST')
    assert.equal(xhr.url, '/api/onboarding/documents')
    assert.ok(xhr.sentBody instanceof FormData)
    assert.equal(xhr.sentBody.get('documentType'), 'gst_certificate')
    assert.equal(xhr.sentBody.get('file').name, 'gst.pdf')
    xhr._respond(201, JSON.stringify({ id: 'x', documentType: 'gst_certificate', fileName: 'gst.pdf' }))
    await promise
  })
})

test('uploadKycDocument reports upload progress as the real XHR upload.onprogress event fires', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  await withFakeXHR(async () => {
    const seen = []
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file, onProgress: (p) => seen.push(p) })
    await new Promise((r) => setTimeout(r, 0))
    const xhr = FakeXHR.lastInstance
    xhr._progress(5, 10)
    xhr._progress(10, 10)
    xhr._respond(201, JSON.stringify({ id: 'x', documentType: 'gst_certificate', fileName: 'gst.pdf' }))
    await promise
    assert.deepEqual(seen, [{ loaded: 5, total: 10 }, { loaded: 10, total: 10 }])
  })
})

test('uploadKycDocument rejects on a 422 with the real error message and never resolves', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  const { ApiError } = await import('@gift/api-client')
  await withFakeXHR(async () => {
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file })
    await new Promise((r) => setTimeout(r, 0))
    FakeXHR.lastInstance._respond(422, JSON.stringify({ error: 'A file is required', code: 'invalid_request' }))
    await assert.rejects(promise, (err) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 422)
      assert.equal(err.message, 'A file is required')
      return true
    })
  })
})

test('uploadKycDocument rejects with RateLimitedUploadError carrying the real Retry-After seconds on a 429', async () => {
  const { uploadKycDocument, RateLimitedUploadError } = await import('../src/lib/features/onboarding/documentUpload.ts')
  await withFakeXHR(async () => {
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file })
    await new Promise((r) => setTimeout(r, 0))
    FakeXHR.lastInstance._respond(429, JSON.stringify({ error: 'Too many requests.' }), { 'Retry-After': '42' })
    await assert.rejects(promise, (err) => {
      assert.ok(err instanceof RateLimitedUploadError)
      assert.equal(err.retryAfterSeconds, 42)
      return true
    })
  })
})

test('uploadKycDocument rejects with an AbortError, never a false success, when cancelled mid-upload', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  await withFakeXHR(async () => {
    const controller = new AbortController()
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file, signal: controller.signal })
    await new Promise((r) => setTimeout(r, 0))
    controller.abort()
    await assert.rejects(promise, (err) => {
      assert.equal(err.name, 'AbortError')
      return true
    })
  })
})

test('uploadKycDocument rejects immediately if the signal is already aborted, never starting a request', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  await withFakeXHR(async () => {
    const controller = new AbortController()
    controller.abort()
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    FakeXHR.lastInstance = undefined
    await assert.rejects(
      uploadKycDocument({ documentType: 'gst_certificate', file, signal: controller.signal }),
      (err) => err.name === 'AbortError',
    )
    assert.equal(FakeXHR.lastInstance, undefined, 'no XHR should ever have been opened')
  })
})

test('uploadKycDocument rejects on a transport-level network error, never a false success', async () => {
  const { uploadKycDocument } = await import('../src/lib/features/onboarding/documentUpload.ts')
  const { ApiError } = await import('@gift/api-client')
  await withFakeXHR(async () => {
    const file = new File([Buffer.from('hello')], 'gst.pdf', { type: 'application/pdf' })
    const promise = uploadKycDocument({ documentType: 'gst_certificate', file })
    await new Promise((r) => setTimeout(r, 0))
    FakeXHR.lastInstance._networkError()
    await assert.rejects(promise, (err) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.isNetworkError, true)
      return true
    })
  })
})

test('kycDocumentFileUrl builds the dedicated download route, with and without forced download', async () => {
  const { kycDocumentFileUrl } = await import('../src/lib/features/onboarding/documentUpload.ts')
  assert.equal(kycDocumentFileUrl('doc-1'), '/api/onboarding/documents/doc-1/file')
  assert.equal(kycDocumentFileUrl('doc-1', { download: true }), '/api/onboarding/documents/doc-1/file?download=1')
})
