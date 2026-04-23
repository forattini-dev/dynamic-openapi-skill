import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import type { ParsedOperation, ParsedSpec } from 'dynamic-openapi-tools/parser'

export interface PaginationPattern {
  style: 'offset' | 'page' | 'cursor'
  params: string[]
  operationCount: number
}

export interface ErrorPattern {
  properties: string[]
  operationCount: number
}

export interface DetectedPatterns {
  pagination?: PaginationPattern
  error?: ErrorPattern
}

interface PaginationStyle {
  style: PaginationPattern['style']
  required: string[]
  optional?: string[]
}

const PAGINATION_STYLES: PaginationStyle[] = [
  { style: 'offset', required: ['limit', 'offset'] },
  { style: 'offset', required: ['limit', 'skip'] },
  { style: 'page', required: ['page', 'size'] },
  { style: 'page', required: ['page', 'per_page'] },
  { style: 'page', required: ['page', 'perPage'] },
  { style: 'page', required: ['page', 'pageSize'] },
  { style: 'cursor', required: ['cursor'] },
  { style: 'cursor', required: ['after'] },
  { style: 'cursor', required: ['starting_after'] },
  { style: 'cursor', required: ['startingAfter'] },
]

export function detectPatterns(spec: ParsedSpec): DetectedPatterns {
  return {
    pagination: detectPagination(spec.operations),
    error: detectErrorShape(spec.operations),
  }
}

export function detectPagination(operations: ParsedOperation[]): PaginationPattern | undefined {
  const counts = new Map<string, { style: PaginationStyle; count: number }>()

  for (const op of operations) {
    const queryNames = op.parameters.filter((p) => p.in === 'query').map((p) => p.name)
    if (queryNames.length === 0) continue
    const nameSet = new Set(queryNames)
    for (const style of PAGINATION_STYLES) {
      if (!style.required.every((n) => nameSet.has(n))) continue
      const key = style.required.join(',')
      const current = counts.get(key)
      if (current) current.count++
      else counts.set(key, { style, count: 1 })
      break
    }
  }

  let best: { style: PaginationStyle; count: number } | undefined
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  if (!best || best.count < 2) return undefined

  return {
    style: best.style.style,
    params: best.style.required,
    operationCount: best.count,
  }
}

export function detectErrorShape(operations: ParsedOperation[]): ErrorPattern | undefined {
  const fingerprintCounts = new Map<string, { properties: string[]; count: number }>()

  for (const op of operations) {
    const seenInThisOp = new Set<string>()
    for (const [code, resp] of Object.entries(op.responses)) {
      if (!isErrorCode(code)) continue
      const schema = pickSchemaFromResponse(resp)
      if (!schema) continue
      const props = topLevelProperties(schema)
      if (props.length === 0) continue
      const fp = props.join(',')
      if (seenInThisOp.has(fp)) continue
      seenInThisOp.add(fp)
      const current = fingerprintCounts.get(fp)
      if (current) current.count++
      else fingerprintCounts.set(fp, { properties: props, count: 1 })
    }
  }

  let best: { properties: string[]; count: number } | undefined
  for (const entry of fingerprintCounts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  if (!best || best.count < 2) return undefined

  return { properties: best.properties, operationCount: best.count }
}

function isErrorCode(code: string): boolean {
  if (code === 'default') return true
  return code.startsWith('4') || code.startsWith('5')
}

function pickSchemaFromResponse(resp: {
  content?: Record<string, { schema?: OpenAPIV3.SchemaObject }>
  schema?: OpenAPIV3.SchemaObject
}): OpenAPIV3.SchemaObject | undefined {
  if (resp.schema) return resp.schema
  if (resp.content) {
    const json = resp.content['application/json']
    if (json?.schema) return json.schema
    const firstKey = Object.keys(resp.content)[0]
    if (firstKey) return resp.content[firstKey]!.schema
  }
  return undefined
}

function topLevelProperties(schema: OpenAPIV3.SchemaObject): string[] {
  if (schema.allOf) {
    const merged: string[] = []
    for (const s of schema.allOf) {
      for (const p of topLevelProperties(s as OpenAPIV3.SchemaObject)) {
        if (!merged.includes(p)) merged.push(p)
      }
    }
    return merged
  }
  if (schema.oneOf) return topLevelProperties(schema.oneOf[0] as OpenAPIV3.SchemaObject)
  if (schema.anyOf) return topLevelProperties(schema.anyOf[0] as OpenAPIV3.SchemaObject)
  if (schema.type === 'object' || schema.properties) {
    return Object.keys(schema.properties ?? {})
  }
  return []
}

export function renderPaginationHint(pattern: PaginationPattern): string {
  const names = pattern.params.map((p) => `\`${p}\``).join(', ')
  const style = pattern.style === 'offset' ? 'offset/limit' : pattern.style === 'page' ? 'page/size' : 'cursor'
  return `Pagination (${style}): ${pattern.operationCount} operation${pattern.operationCount === 1 ? '' : 's'} accept ${names} on the query string.`
}

export function renderErrorHint(pattern: ErrorPattern): string {
  const props = pattern.properties.slice(0, 6).map((p) => `\`${p}\``).join(', ')
  const extra = pattern.properties.length > 6 ? ', …' : ''
  return `Errors: non-2xx bodies share shape \`{ ${pattern.properties.slice(0, 6).join(', ')}${extra} }\` (seen in ${pattern.operationCount} ops) — fields: ${props}.`
}
