import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import type { ParsedOperation } from 'dynamic-openapi-tools/parser'
import { exampleFromSchema } from './schema.js'

export interface CurlOptions {
  baseUrl: string
  securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>
}

export function buildCurlExample(op: ParsedOperation, opts: CurlOptions): string {
  const lines: string[] = []
  const path = substitutePathParams(op)
  const query = buildQueryString(op)
  const url = joinUrl(opts.baseUrl, path) + query

  lines.push(`curl -X ${op.method} '${url}' \\`)

  for (const line of authHeaders(op, opts.securitySchemes)) {
    lines.push(`  ${line} \\`)
  }

  const headerParams = op.parameters.filter((p) => p.in === 'header')
  for (const p of headerParams) {
    const value = String(exampleFromSchema(p.schema) ?? `<${p.name}>`)
    lines.push(`  -H '${p.name}: ${value}' \\`)
  }

  const body = buildBodySnippet(op)
  if (body) {
    lines.push(`  -H 'Content-Type: ${body.contentType}' \\`)
    lines.push(`  ${body.flag} ${body.data}`)
  } else {
    const last = lines.pop()!
    lines.push(last.replace(/ \\$/, ''))
  }

  return lines.join('\n')
}

function substitutePathParams(op: ParsedOperation): string {
  let path = op.path
  for (const p of op.parameters) {
    if (p.in !== 'path') continue
    const sample = String(exampleFromSchema(p.schema) ?? `<${p.name}>`)
    path = path.replace(`{${p.name}}`, encodeURIComponent(sample))
  }
  return path
}

function buildQueryString(op: ParsedOperation): string {
  const required = op.parameters.filter((p) => p.in === 'query' && p.required)
  if (required.length === 0) return ''
  const pairs = required.map((p) => {
    const v = String(exampleFromSchema(p.schema) ?? '')
    return `${encodeURIComponent(p.name)}=${encodeURIComponent(v)}`
  })
  return '?' + pairs.join('&')
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path)
}

function authHeaders(
  op: ParsedOperation,
  schemes: Record<string, OpenAPIV3.SecuritySchemeObject>
): string[] {
  const headers: string[] = []
  const requirements = op.security

  for (const req of requirements) {
    for (const schemeName of Object.keys(req)) {
      const scheme = schemes[schemeName]
      if (!scheme) continue

      if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        headers.push(`-H 'Authorization: Bearer $TOKEN'`)
      } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
        headers.push(`-u "$USER:$PASSWORD"`)
      } else if (scheme.type === 'apiKey' && scheme.in === 'header') {
        headers.push(`-H '${scheme.name}: $API_KEY'`)
      } else if (scheme.type === 'oauth2') {
        headers.push(`-H 'Authorization: Bearer $TOKEN'`)
      }
    }
  }

  return headers
}

interface BodySnippet {
  contentType: string
  flag: string
  data: string
}

function buildBodySnippet(op: ParsedOperation): BodySnippet | null {
  if (!op.requestBody) return null
  const content = op.requestBody.content
  const mediaTypes = Object.keys(content)
  if (mediaTypes.length === 0) return null

  const mediaType = pickMediaType(mediaTypes)
  const media = content[mediaType]
  if (!media) return null

  const sample = media.example ?? exampleFromSchema(media.schema)

  if (mediaType.includes('json')) {
    const json = JSON.stringify(sample, null, 2)
    return { contentType: mediaType, flag: '-d', data: `'${json.replace(/'/g, "'\\''")}'` }
  }
  if (mediaType.includes('form-urlencoded')) {
    const encoded = encodeFormUrl(sample)
    return { contentType: mediaType, flag: '--data-urlencode', data: `'${encoded}'` }
  }
  if (mediaType.includes('multipart')) {
    return { contentType: mediaType, flag: '-F', data: "'field=@./file'" }
  }
  return { contentType: mediaType, flag: '--data-binary', data: '@./payload' }
}

function pickMediaType(types: string[]): string {
  const preferred = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data']
  for (const p of preferred) {
    if (types.includes(p)) return p
  }
  return types[0]!
}

function encodeFormUrl(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
    .join('&')
}
