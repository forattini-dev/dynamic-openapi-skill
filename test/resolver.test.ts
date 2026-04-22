import { describe, it, expect } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import { resolveSpec } from '../src/parser/resolver.js'

function makeDoc(extra: Partial<OpenAPIV3.Document> = {}): OpenAPIV3.Document {
  return {
    openapi: '3.0.0',
    info: { title: 'T', version: '1.0.0', description: 'top' },
    paths: {},
    ...extra,
  } as OpenAPIV3.Document
}

describe('resolveSpec', () => {
  it('rejects invalid specs with an error referencing the validation failure', async () => {
    const bad = { openapi: '3.0.0' } as OpenAPIV3.Document
    await expect(resolveSpec(bad)).rejects.toThrow(/Invalid OpenAPI spec/)
  })

  it('extracts servers with variables expanded', async () => {
    const doc = makeDoc({
      servers: [
        {
          url: 'https://{env}.example.com',
          description: 'with vars',
          variables: { env: { default: 'api', enum: ['api', 'sandbox'], description: 'env name' } },
        },
      ],
    })
    const spec = await resolveSpec(doc)
    expect(spec.servers).toHaveLength(1)
    expect(spec.servers[0]!.variables).toEqual({
      env: { default: 'api', enum: ['api', 'sandbox'], description: 'env name' },
    })
  })

  it('generates operationIds when missing and propagates tags', async () => {
    const doc = makeDoc({
      paths: {
        '/pets/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            responses: { '200': { description: 'ok' } },
            tags: ['pets'],
          },
        },
      },
    })
    const spec = await resolveSpec(doc)
    expect(spec.operations).toHaveLength(1)
    expect(spec.operations[0]!.operationId).toBe('get_pets_by_id')
    expect(spec.operations[0]!.tags).toEqual(['pets'])
  })

  it('merges path-level and operation-level parameters, deduplicating by name+in', async () => {
    const doc = makeDoc({
      paths: {
        '/things': {
          parameters: [
            { name: 'trace', in: 'header', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          get: {
            parameters: [
              { name: 'limit', in: 'query', required: true, schema: { type: 'integer' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    })
    const spec = await resolveSpec(doc)
    const op = spec.operations[0]!
    expect(op.parameters.map((p) => p.name)).toEqual(expect.arrayContaining(['trace', 'limit']))
    const limit = op.parameters.find((p) => p.name === 'limit')!
    expect(limit.required).toBe(true)
  })

  it('parses request bodies, examples, responses, and links', async () => {
    const doc = makeDoc({
      paths: {
        '/things': {
          post: {
            operationId: 'createThing',
            requestBody: {
              required: true,
              description: 'payload',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { a: { type: 'integer' } } },
                  examples: { sample: { summary: 's', description: 'd', value: { a: 2 } } },
                },
              },
            },
            responses: {
              '201': {
                description: 'created',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'integer' } } },
                    examples: { sample: { value: { id: 2 } } },
                  },
                },
                links: { self: { operationId: 'getThing', description: 'd' } },
              },
            },
          },
        },
      },
    })
    const spec = await resolveSpec(doc)
    const op = spec.operations[0]!
    expect(op.requestBody?.content['application/json']?.examples?.['sample']?.value).toEqual({ a: 2 })
    expect(op.responses['201']?.mediaType).toBe('application/json')
    expect(op.responses['201']?.examples?.['sample']?.value).toEqual({ id: 2 })
    expect(op.responses['201']?.links?.['self']?.operationId).toBe('getThing')
  })

  it('uses operation.security when present, falls back to doc.security otherwise', async () => {
    const doc = makeDoc({
      security: [{ global: [] }],
      paths: {
        '/a': { get: { responses: { '200': { description: 'ok' } } } },
        '/b': {
          get: { security: [{ op: [] }], responses: { '200': { description: 'ok' } } },
        },
      },
    })
    const spec = await resolveSpec(doc)
    const a = spec.operations.find((o) => o.path === '/a')!
    const b = spec.operations.find((o) => o.path === '/b')!
    expect(a.security).toEqual([{ global: [] }])
    expect(b.security).toEqual([{ op: [] }])
  })

  it('extracts component schemas, security schemes, tags, and external docs', async () => {
    const doc = makeDoc({
      components: {
        schemas: { Pet: { type: 'object' } },
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      },
      tags: [
        {
          name: 'pets',
          description: 'Pets',
          externalDocs: { url: 'https://example.com', description: 'ext' },
        },
        { name: 'orphan' },
      ],
      externalDocs: { url: 'https://example.com/root', description: 'top' },
    })
    const spec = await resolveSpec(doc)
    expect(spec.schemas['Pet']).toBeDefined()
    expect(spec.securitySchemes['bearer']).toBeDefined()
    expect(spec.tags).toEqual([
      {
        name: 'pets',
        description: 'Pets',
        externalDocs: { url: 'https://example.com', description: 'ext' },
      },
      { name: 'orphan' },
    ])
    expect(spec.externalDocs).toEqual({ url: 'https://example.com/root', description: 'top' })
  })

  it('sets operation.hidden when `x-hidden: true` is on the operation', async () => {
    const doc = makeDoc({
      paths: {
        '/a': {
          get: {
            'x-hidden': true,
            responses: { '200': { description: 'ok' } },
          } as OpenAPIV3.OperationObject,
        },
      },
    }) as OpenAPIV3.Document
    const spec = await resolveSpec(doc)
    expect(spec.operations[0]!.hidden).toBe(true)
  })
})
