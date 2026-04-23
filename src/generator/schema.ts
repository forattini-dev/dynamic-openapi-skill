import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'

type Schema = OpenAPIV3.SchemaObject

export function describeSchema(schema: Schema | undefined): string {
  if (!schema) return 'any'

  if (schema.enum && schema.enum.length > 0) {
    const values = schema.enum.map((v) => JSON.stringify(v)).join(' | ')
    return `enum(${values})`
  }

  if (schema.oneOf) {
    return schema.oneOf.map((s) => describeSchema(s as Schema)).join(' | ')
  }
  if (schema.anyOf) {
    return schema.anyOf.map((s) => describeSchema(s as Schema)).join(' | ')
  }
  if (schema.allOf) {
    return schema.allOf.map((s) => describeSchema(s as Schema)).join(' & ')
  }

  if (schema.type === 'array') {
    const items = schema.items as Schema | undefined
    return `array<${describeSchema(items)}>`
  }

  if (schema.type === 'object' || schema.properties) {
    return 'object'
  }

  if (schema.format) return `${schema.type ?? 'any'}(${schema.format})`
  return schema.type ?? 'any'
}

export function renderSchemaBlock(schema: Schema | undefined, indent = 0): string {
  if (!schema) return '```\nany\n```'
  const lines: string[] = []
  lines.push('```yaml')
  renderSchemaLines(schema, indent, lines)
  lines.push('```')
  return lines.join('\n')
}

function renderSchemaLines(schema: Schema, indent: number, out: string[]): void {
  const pad = '  '.repeat(indent)

  if (schema.allOf) {
    out.push(`${pad}allOf:`)
    for (const s of schema.allOf) {
      out.push(`${pad}  -`)
      renderSchemaLines(s as Schema, indent + 2, out)
    }
    return
  }
  if (schema.oneOf) {
    out.push(`${pad}oneOf:`)
    for (const s of schema.oneOf) {
      out.push(`${pad}  -`)
      renderSchemaLines(s as Schema, indent + 2, out)
    }
    return
  }
  if (schema.anyOf) {
    out.push(`${pad}anyOf:`)
    for (const s of schema.anyOf) {
      out.push(`${pad}  -`)
      renderSchemaLines(s as Schema, indent + 2, out)
    }
    return
  }

  if (schema.type === 'object' || schema.properties) {
    out.push(`${pad}type: object`)
    if (schema.required && schema.required.length > 0) {
      out.push(`${pad}required: [${schema.required.join(', ')}]`)
    }
    if (schema.properties) {
      out.push(`${pad}properties:`)
      for (const [name, prop] of Object.entries(schema.properties)) {
        const ps = prop as Schema
        out.push(`${pad}  ${name}:`)
        renderSchemaLines(ps, indent + 2, out)
      }
    }
    return
  }

  if (schema.type === 'array') {
    out.push(`${pad}type: array`)
    if (schema.items) {
      out.push(`${pad}items:`)
      renderSchemaLines(schema.items as Schema, indent + 1, out)
    }
    return
  }

  if (schema.type) out.push(`${pad}type: ${schema.type}`)
  if (schema.format) out.push(`${pad}format: ${schema.format}`)
  if (schema.enum) out.push(`${pad}enum: [${schema.enum.map((v) => JSON.stringify(v)).join(', ')}]`)
  if (schema.default !== undefined) out.push(`${pad}default: ${JSON.stringify(schema.default)}`)
  if (schema.minimum !== undefined) out.push(`${pad}minimum: ${schema.minimum}`)
  if (schema.maximum !== undefined) out.push(`${pad}maximum: ${schema.maximum}`)
  if (schema.minLength !== undefined) out.push(`${pad}minLength: ${schema.minLength}`)
  if (schema.maxLength !== undefined) out.push(`${pad}maxLength: ${schema.maxLength}`)
  if (schema.pattern) out.push(`${pad}pattern: ${JSON.stringify(schema.pattern)}`)
  if (schema.description) out.push(`${pad}description: ${JSON.stringify(schema.description)}`)
  if (schema.example !== undefined) out.push(`${pad}example: ${JSON.stringify(schema.example)}`)
}

export function exampleFromSchema(schema: Schema | undefined): unknown {
  if (!schema) return null
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]

  if (schema.allOf) {
    const merged: Record<string, unknown> = {}
    for (const s of schema.allOf) {
      const sub = exampleFromSchema(s as Schema)
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        Object.assign(merged, sub)
      }
    }
    return merged
  }
  if (schema.oneOf) return exampleFromSchema(schema.oneOf[0] as Schema)
  if (schema.anyOf) return exampleFromSchema(schema.anyOf[0] as Schema)

  if (schema.type === 'array') {
    return [exampleFromSchema(schema.items as Schema | undefined)]
  }
  if (schema.type === 'object' || schema.properties) {
    const out: Record<string, unknown> = {}
    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        out[name] = exampleFromSchema(prop as Schema)
      }
    }
    return out
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date') return '2024-01-01'
      if (schema.format === 'date-time') return '2024-01-01T00:00:00Z'
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000'
      if (schema.format === 'email') return 'user@example.com'
      if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com'
      return 'string'
    case 'integer':
      return 0
    case 'number':
      return 0
    case 'boolean':
      return false
    default:
      return null
  }
}
