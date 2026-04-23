import { describe, it, expect } from 'vitest'
import type { ParsedOperation } from 'dynamic-openapi-tools/parser'
import { detectErrorShape, detectPagination } from '../src/generator/patterns.js'

function op(operationId: string, overrides: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    operationId,
    method: 'GET',
    path: `/${operationId}`,
    tags: [],
    parameters: [],
    responses: {},
    security: [],
    ...overrides,
  }
}

function param(name: string): ParsedOperation['parameters'][number] {
  return {
    name,
    in: 'query',
    required: false,
    schema: { type: 'string' },
  }
}

describe('detectPagination', () => {
  it('identifies limit/offset when at least 2 operations use it', () => {
    const ops = [
      op('listA', { parameters: [param('limit'), param('offset')] }),
      op('listB', { parameters: [param('limit'), param('offset'), param('status')] }),
    ]
    const p = detectPagination(ops)
    expect(p?.style).toBe('offset')
    expect(p?.params).toEqual(['limit', 'offset'])
    expect(p?.operationCount).toBe(2)
  })

  it('identifies page/size', () => {
    const ops = [
      op('listA', { parameters: [param('page'), param('size')] }),
      op('listB', { parameters: [param('page'), param('size')] }),
    ]
    expect(detectPagination(ops)?.style).toBe('page')
  })

  it('identifies cursor-based', () => {
    const ops = [
      op('listA', { parameters: [param('cursor')] }),
      op('listB', { parameters: [param('cursor'), param('limit')] }),
    ]
    expect(detectPagination(ops)?.style).toBe('cursor')
  })

  it('returns undefined when only one operation paginates', () => {
    const ops = [op('listA', { parameters: [param('limit'), param('offset')] })]
    expect(detectPagination(ops)).toBeUndefined()
  })

  it('returns undefined when no pagination parameters are present', () => {
    expect(detectPagination([op('listA'), op('listB')])).toBeUndefined()
  })
})

describe('detectErrorShape', () => {
  const errorSchema = {
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  }

  it('finds a shared error shape across multiple operations', () => {
    const ops = [
      op('a', {
        responses: { '400': { description: 'bad', schema: errorSchema as never } },
      }),
      op('b', {
        responses: { '404': { description: 'nf', schema: errorSchema as never } },
      }),
    ]
    const e = detectErrorShape(ops)
    expect(e?.properties).toEqual(['code', 'message'])
    expect(e?.operationCount).toBe(2)
  })

  it('counts `default` responses as errors', () => {
    const ops = [
      op('a', { responses: { default: { description: 'err', schema: errorSchema as never } } }),
      op('b', { responses: { default: { description: 'err', schema: errorSchema as never } } }),
    ]
    expect(detectErrorShape(ops)?.operationCount).toBe(2)
  })

  it('returns undefined when fewer than 2 ops share the shape', () => {
    const ops = [
      op('a', { responses: { '400': { description: 'bad', schema: errorSchema as never } } }),
    ]
    expect(detectErrorShape(ops)).toBeUndefined()
  })
})
