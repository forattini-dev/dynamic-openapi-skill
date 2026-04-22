import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveSource, loadSpec, loadSpecWithSource } from '../src/parser/loader.js'

describe('resolveSource', () => {
  it('detects HTTP URLs', () => {
    expect(resolveSource('http://api.example.com/spec.json')).toEqual({
      type: 'url',
      value: 'http://api.example.com/spec.json',
    })
    expect(resolveSource('https://api.example.com/spec.json').type).toBe('url')
  })

  it('detects inline JSON strings', () => {
    const raw = '{"openapi":"3.0.0"}'
    expect(resolveSource(raw)).toEqual({ type: 'inline', value: raw })
  })

  it('detects inline YAML strings', () => {
    const raw = 'openapi: 3.0.0'
    expect(resolveSource(raw)).toEqual({ type: 'inline', value: raw })
  })

  it('falls through to file type for plain paths', () => {
    expect(resolveSource('./foo.yaml')).toEqual({ type: 'file', value: './foo.yaml' })
  })

  it('treats Document objects as inline', () => {
    const doc = { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveSource(doc as any)).toEqual({ type: 'inline', value: doc })
  })
})

describe('loadSpecWithSource', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads a YAML file from disk', async () => {
    const loaded = await loadSpecWithSource('./test/fixtures/petstore.yaml')
    expect(loaded.doc.openapi).toMatch(/^3\./)
    expect(loaded.sourceLabel).toBe('./test/fixtures/petstore.yaml')
    expect(loaded.text).toContain('openapi:')
  })

  it('loadSpec unwraps the doc', async () => {
    const doc = await loadSpec('./test/fixtures/petstore.yaml')
    expect(doc.openapi).toMatch(/^3\./)
  })

  it('parses JSON specs', async () => {
    const raw = JSON.stringify({ openapi: '3.0.0', info: { title: 'X', version: '1' }, paths: {} })
    const loaded = await loadSpecWithSource(raw)
    expect(loaded.doc.info.title).toBe('X')
    expect(loaded.sourceLabel).toBe('(inline)')
  })

  it('parses inline YAML strings', async () => {
    const raw = 'openapi: 3.0.0\ninfo:\n  title: Y\n  version: "1"\npaths: {}\n'
    const loaded = await loadSpecWithSource(raw)
    expect(loaded.doc.info.title).toBe('Y')
  })

  it('returns inline document objects unchanged with stringified text', async () => {
    const doc = { openapi: '3.0.0', info: { title: 'Z', version: '1' }, paths: {} }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded = await loadSpecWithSource(doc as any)
    expect(loaded.doc).toBe(doc)
    expect(loaded.text).toBe(JSON.stringify(doc))
    expect(loaded.sourceLabel).toBe('(inline)')
  })

  it('reports a helpful error when a file is missing', async () => {
    await expect(loadSpecWithSource('/does/not/exist.yaml')).rejects.toThrow(/Failed to read spec file/)
  })

  it('reports a helpful error for malformed JSON', async () => {
    const bad = '{ not: valid'
    await expect(loadSpecWithSource(bad)).rejects.toThrow(/Failed to parse JSON/)
  })

  it('reports a helpful error for malformed YAML', async () => {
    const bad = 'openapi: 3.0.0\n  : [invalid'
    await expect(loadSpecWithSource(bad)).rejects.toThrow()
  })

  it('fetches remote specs with fetchWithRetry', async () => {
    const body = 'openapi: 3.0.0\ninfo:\n  title: Remote\n  version: "1"\npaths: {}\n'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'application/yaml' } })
      )
    )
    const loaded = await loadSpecWithSource('https://example.com/spec.yaml')
    expect(loaded.doc.info.title).toBe('Remote')
    expect(loaded.sourceLabel).toBe('https://example.com/spec.yaml')
  })

  it('throws when the remote returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404, statusText: 'Not Found' }))
    )
    await expect(loadSpecWithSource('https://example.com/missing.yaml')).rejects.toThrow(
      /Failed to fetch spec/
    )
  })
})
