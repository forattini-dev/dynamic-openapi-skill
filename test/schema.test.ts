import { describe, it, expect } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import { describeSchema, renderSchemaBlock, exampleFromSchema } from '../src/generator/schema.js'

type Schema = OpenAPIV3.SchemaObject

describe('describeSchema', () => {
  it('returns `any` for undefined', () => {
    expect(describeSchema(undefined)).toBe('any')
  })

  it('stringifies enums', () => {
    expect(describeSchema({ type: 'string', enum: ['a', 'b'] } as Schema)).toBe('enum("a" | "b")')
  })

  it('describes oneOf / anyOf / allOf', () => {
    const oneOf: Schema = { oneOf: [{ type: 'string' }, { type: 'integer' }] }
    expect(describeSchema(oneOf)).toBe('string | integer')
    const anyOf: Schema = { anyOf: [{ type: 'boolean' }, { type: 'number' }] }
    expect(describeSchema(anyOf)).toBe('boolean | number')
    const allOf: Schema = { allOf: [{ type: 'string' }, { type: 'integer' }] }
    expect(describeSchema(allOf)).toBe('string & integer')
  })

  it('describes arrays and nested arrays', () => {
    const schema: Schema = { type: 'array', items: { type: 'string' } }
    expect(describeSchema(schema)).toBe('array<string>')
    const nested: Schema = { type: 'array', items: { type: 'array', items: { type: 'integer' } } as Schema }
    expect(describeSchema(nested)).toBe('array<array<integer>>')
  })

  it('detects objects via type or properties and falls back to `any`', () => {
    expect(describeSchema({ type: 'object' } as Schema)).toBe('object')
    expect(describeSchema({ properties: { a: { type: 'string' } } } as Schema)).toBe('object')
    expect(describeSchema({} as Schema)).toBe('any')
  })

  it('uses format when present', () => {
    expect(describeSchema({ type: 'string', format: 'uuid' } as Schema)).toBe('string(uuid)')
    expect(describeSchema({ format: 'uuid' } as Schema)).toBe('any(uuid)')
  })
})

describe('renderSchemaBlock', () => {
  it('returns an `any` block when schema is undefined', () => {
    expect(renderSchemaBlock(undefined)).toBe('```\nany\n```')
  })

  it('renders object schemas with required and properties', () => {
    const schema: Schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        age: { type: 'integer', format: 'int32', minimum: 0, maximum: 120, default: 18 },
      },
    }
    const block = renderSchemaBlock(schema)
    expect(block).toContain('type: object')
    expect(block).toContain('required: [id]')
    expect(block).toContain('age:')
    expect(block).toContain('format: int32')
    expect(block).toContain('minimum: 0')
    expect(block).toContain('maximum: 120')
    expect(block).toContain('default: 18')
  })

  it('renders arrays with items', () => {
    const schema: Schema = { type: 'array', items: { type: 'string' } }
    const block = renderSchemaBlock(schema)
    expect(block).toContain('type: array')
    expect(block).toContain('items:')
    expect(block).toContain('type: string')
  })

  it('renders allOf, oneOf, anyOf blocks', () => {
    const allOfBlock = renderSchemaBlock({ allOf: [{ type: 'string' }, { type: 'integer' }] } as Schema)
    expect(allOfBlock).toContain('allOf:')
    const oneOfBlock = renderSchemaBlock({ oneOf: [{ type: 'string' }] } as Schema)
    expect(oneOfBlock).toContain('oneOf:')
    const anyOfBlock = renderSchemaBlock({ anyOf: [{ type: 'string' }] } as Schema)
    expect(anyOfBlock).toContain('anyOf:')
  })

  it('renders string constraints and examples', () => {
    const schema: Schema = {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      pattern: '^[a-z]+$',
      description: 'lowercase only',
      example: 'abc',
      enum: ['abc', 'def'],
    }
    const block = renderSchemaBlock(schema)
    expect(block).toContain('minLength: 1')
    expect(block).toContain('maxLength: 50')
    expect(block).toContain('pattern: "^[a-z]+$"')
    expect(block).toContain('description: "lowercase only"')
    expect(block).toContain('example: "abc"')
    expect(block).toContain('enum: ["abc", "def"]')
  })
})

describe('exampleFromSchema', () => {
  it('returns null for undefined', () => {
    expect(exampleFromSchema(undefined)).toBeNull()
  })

  it('uses the explicit example when present', () => {
    expect(exampleFromSchema({ type: 'string', example: 'hi' } as Schema)).toBe('hi')
  })

  it('uses default when no example is available', () => {
    expect(exampleFromSchema({ type: 'integer', default: 42 } as Schema)).toBe(42)
  })

  it('uses the first enum value when no example or default', () => {
    expect(exampleFromSchema({ type: 'string', enum: ['red', 'blue'] } as Schema)).toBe('red')
  })

  it('merges allOf objects', () => {
    const schema: Schema = {
      allOf: [
        { type: 'object', properties: { id: { type: 'string' } } },
        { type: 'object', properties: { name: { type: 'string' } } },
      ] as Schema[],
    }
    expect(exampleFromSchema(schema)).toEqual({ id: 'string', name: 'string' })
  })

  it('falls back to first oneOf / anyOf entry', () => {
    const schema: Schema = { oneOf: [{ type: 'string' }, { type: 'integer' }] }
    expect(exampleFromSchema(schema)).toBe('string')
    const schema2: Schema = { anyOf: [{ type: 'boolean' }, { type: 'integer' }] }
    expect(exampleFromSchema(schema2)).toBe(false)
  })

  it('generates arrays and nested objects', () => {
    const schema: Schema = {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' } } } as Schema,
    }
    expect(exampleFromSchema(schema)).toEqual([{ id: 'string' }])
  })

  it('supports common string formats', () => {
    expect(exampleFromSchema({ type: 'string', format: 'date' } as Schema)).toBe('2024-01-01')
    expect(exampleFromSchema({ type: 'string', format: 'date-time' } as Schema)).toBe(
      '2024-01-01T00:00:00Z'
    )
    expect(exampleFromSchema({ type: 'string', format: 'uuid' } as Schema)).toBe(
      '00000000-0000-0000-0000-000000000000'
    )
    expect(exampleFromSchema({ type: 'string', format: 'email' } as Schema)).toBe('user@example.com')
    expect(exampleFromSchema({ type: 'string', format: 'uri' } as Schema)).toBe('https://example.com')
    expect(exampleFromSchema({ type: 'string', format: 'url' } as Schema)).toBe('https://example.com')
    expect(exampleFromSchema({ type: 'string' } as Schema)).toBe('string')
  })

  it('returns scalar defaults for numeric and boolean types', () => {
    expect(exampleFromSchema({ type: 'integer' } as Schema)).toBe(0)
    expect(exampleFromSchema({ type: 'number' } as Schema)).toBe(0)
    expect(exampleFromSchema({ type: 'boolean' } as Schema)).toBe(false)
    expect(exampleFromSchema({} as Schema)).toBeNull()
  })

  it('generates objects from properties when no example / default', () => {
    const schema: Schema = {
      type: 'object',
      properties: { id: { type: 'string' }, age: { type: 'integer' } },
    }
    expect(exampleFromSchema(schema)).toEqual({ id: 'string', age: 0 })
  })
})
