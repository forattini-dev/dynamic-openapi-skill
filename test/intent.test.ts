import { describe, it, expect } from 'vitest'
import {
  buildDescription,
  extractIntent,
  extractNounFromOperation,
  extractVerbFromOperation,
  pluralize,
  singularize,
} from '../src/generator/intent.js'
import type { ParsedOperation, ParsedSpec } from '../src/parser/types.js'

function op(
  operationId: string,
  method: string,
  path: string,
  tags: string[] = []
): ParsedOperation {
  return {
    operationId,
    method,
    path,
    tags,
    parameters: [],
    responses: {},
    security: [],
  }
}

describe('extractVerbFromOperation', () => {
  it.each([
    ['listPets', 'GET', '/pets', 'list'],
    ['getPetById', 'GET', '/pets/{id}', 'get'],
    ['createPet', 'POST', '/pets', 'create'],
    ['updatePet', 'PATCH', '/pets/{id}', 'update'],
    ['deletePet', 'DELETE', '/pets/{id}', 'delete'],
    ['uploadPetImage', 'PUT', '/pets/{id}/image', 'upload'],
    ['searchOrders', 'GET', '/orders', 'search'],
    ['refund_payment', 'POST', '/payments/{id}/refund', 'refund'],
  ])('extracts "%s" from %s %s', (id, method, path, expected) => {
    expect(extractVerbFromOperation(op(id, method, path))).toBe(expected)
  })

  it('falls back to method+path when operationId has no known verb', () => {
    expect(extractVerbFromOperation(op('foo', 'GET', '/pets'))).toBe('list')
    expect(extractVerbFromOperation(op('foo', 'GET', '/pets/{id}'))).toBe('get')
    expect(extractVerbFromOperation(op('foo', 'POST', '/pets'))).toBe('create')
    expect(extractVerbFromOperation(op('foo', 'DELETE', '/pets/{id}'))).toBe('delete')
  })
})

describe('extractNounFromOperation', () => {
  it('uses the first tag when present', () => {
    expect(extractNounFromOperation(op('listPets', 'GET', '/pets', ['pets']))).toBe('pet')
  })

  it('falls back to the last non-parameter path segment', () => {
    expect(extractNounFromOperation(op('fetchX', 'GET', '/orders/{id}'))).toBe('order')
  })

  it('handles nested paths', () => {
    expect(extractNounFromOperation(op('listImages', 'GET', '/pets/{id}/images'))).toBe('image')
  })
})

describe('singularize / pluralize', () => {
  it.each([
    ['pets', 'pet'],
    ['orders', 'order'],
    ['categories', 'category'],
    ['boxes', 'box'],
    ['status', 'status'],
  ])('singularize %s → %s', (input, expected) => {
    expect(singularize(input)).toBe(expected)
  })

  it.each([
    ['pet', 'pets'],
    ['category', 'categories'],
    ['box', 'boxes'],
  ])('pluralize %s → %s', (input, expected) => {
    expect(pluralize(input)).toBe(expected)
  })
})

describe('extractIntent', () => {
  const spec: ParsedSpec = {
    title: 'Petstore',
    version: '1.0.0',
    servers: [],
    operations: [
      op('listPets', 'GET', '/pets', ['pets']),
      op('getPetById', 'GET', '/pets/{id}', ['pets']),
      op('createPet', 'POST', '/pets', ['pets']),
      op('deletePet', 'DELETE', '/pets/{id}', ['pets']),
      op('uploadPetImage', 'PUT', '/pets/{id}/image', ['pets']),
    ],
    schemas: {},
    securitySchemes: {},
    tags: [],
    raw: {} as never,
  }

  it('orders verbs by count then natural CRUD priority', () => {
    const intent = extractIntent(spec)
    expect(intent.verbs[0]).toBe('list')
    expect(intent.verbs).toContain('create')
    expect(intent.verbs).toContain('delete')
    expect(intent.verbs).toContain('upload')
    expect(intent.verbs.indexOf('list')).toBeLessThan(intent.verbs.indexOf('delete'))
  })

  it('collects singularized nouns', () => {
    const intent = extractIntent(spec)
    expect(intent.nouns).toContain('pet')
  })

  it('maps each operation to its verb and noun', () => {
    const intent = extractIntent(spec)
    expect(intent.verbsByOperation.get('listPets')).toBe('list')
    expect(intent.nounsByOperation.get('listPets')).toBe('pet')
  })
})

describe('buildDescription', () => {
  const spec: ParsedSpec = {
    title: 'Petstore',
    version: '1.0.0',
    servers: [],
    operations: [
      op('listPets', 'GET', '/pets', ['pets']),
      op('createPet', 'POST', '/pets', ['pets']),
      op('deletePet', 'DELETE', '/pets/{id}', ['pets']),
    ],
    schemas: {},
    securitySchemes: {},
    tags: [],
    raw: {} as never,
  }

  it('names the top verbs, plural nouns, and the API title', () => {
    const intent = extractIntent(spec)
    const desc = buildDescription({ title: 'Petstore', intent })
    expect(desc).toContain('list')
    expect(desc).toContain('create')
    expect(desc).toContain('delete')
    expect(desc).toContain('pets')
    expect(desc).toContain('Petstore API')
  })

  it('includes intent triggers Claude can match on', () => {
    const intent = extractIntent(spec)
    const desc = buildDescription({ title: 'Petstore', intent })
    expect(desc).toMatch(/Use when the user/i)
  })

  it('respects the length limit', () => {
    const intent = extractIntent(spec)
    const desc = buildDescription({ title: 'Petstore', intent, limit: 80 })
    expect(desc.length).toBeLessThanOrEqual(80)
  })
})
