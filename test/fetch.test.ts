import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithRetry } from '../src/utils/fetch.js'

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns the response on success', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }))
    const res = await fetchWithRetry('https://example.com')
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('retries on 5xx statuses and then returns', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++
      if (calls < 2) return new Response('boom', { status: 503 })
      return new Response('ok', { status: 200 })
    })
    const res = await fetchWithRetry('https://example.com', undefined, { retryDelay: 1 })
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('honors Retry-After header in seconds', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++
      if (calls < 2) return new Response('wait', { status: 429, headers: { 'Retry-After': '0' } })
      return new Response('ok', { status: 200 })
    })
    const res = await fetchWithRetry('https://example.com', undefined, { retryDelay: 1 })
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('honors Retry-After header in HTTP-date format', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++
      if (calls < 2) {
        const future = new Date(Date.now() + 1).toUTCString()
        return new Response('wait', { status: 429, headers: { 'Retry-After': future } })
      }
      return new Response('ok', { status: 200 })
    })
    const res = await fetchWithRetry('https://example.com', undefined, { retryDelay: 1 })
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('gives up after exhausting retries and returns the final response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    const res = await fetchWithRetry('https://example.com', undefined, { retryDelay: 1, retries: 2 })
    expect(res.status).toBe(503)
  })

  it('retries POST only when retryPolicy is `all`', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++
      if (calls < 2) return new Response('', { status: 503 })
      return new Response('ok', { status: 200 })
    })
    const res = await fetchWithRetry(
      'https://example.com',
      { method: 'POST' },
      { retryPolicy: 'all', retryDelay: 1 }
    )
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('does not retry POST under `safe-only` (default)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 503 }))
    const res = await fetchWithRetry('https://example.com', { method: 'POST' }, { retryDelay: 1 })
    expect(res.status).toBe(503)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('retries on network errors and surfaces the final one when all attempts fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('enotfound'))
    await expect(
      fetchWithRetry('https://example.com', undefined, { retries: 1, retryDelay: 1 })
    ).rejects.toThrow('enotfound')
  })

  it('maps AbortError to a timeout message', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr)
    await expect(
      fetchWithRetry('https://example.com', undefined, {
        retries: 0,
        retryDelay: 1,
        timeout: 1,
      })
    ).rejects.toThrow(/timed out/)
  })

  it('does not retry when retryPolicy is `none`', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 503 }))
    const res = await fetchWithRetry('https://example.com', undefined, { retryPolicy: 'none' })
    expect(res.status).toBe(503)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
