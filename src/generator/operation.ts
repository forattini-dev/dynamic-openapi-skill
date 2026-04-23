import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import type { ParsedOperation, ParsedResponse } from 'dynamic-openapi-tools/parser'
import { describeSchema, renderSchemaBlock } from './schema.js'
import { buildCurlExample } from './curl.js'
import { escapeMarkdown, firstLine } from './naming.js'

export interface OperationRenderOptions {
  baseUrl: string
  securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>
  includeExamples: boolean
  headingLevel: number
}

export function renderOperation(op: ParsedOperation, opts: OperationRenderOptions): string {
  const h = '#'.repeat(opts.headingLevel)
  const sub = '#'.repeat(opts.headingLevel + 1)
  const lines: string[] = []

  lines.push(`${h} \`${op.operationId}\``)
  lines.push('')
  lines.push(`**\`${op.method} ${op.path}\`**${op.deprecated ? ' — _deprecated_' : ''}`)
  lines.push('')

  if (op.summary) {
    lines.push(op.summary)
    lines.push('')
  }
  if (op.description && op.description !== op.summary) {
    lines.push(op.description)
    lines.push('')
  }

  if (op.tags.length > 0) {
    lines.push(`Tags: ${op.tags.map((t) => `\`${t}\``).join(', ')}`)
    lines.push('')
  }

  if (op.parameters.length > 0) {
    lines.push(`${sub} Parameters`)
    lines.push('')
    lines.push('| Name | In | Required | Type | Description |')
    lines.push('|------|----|----------|------|-------------|')
    for (const p of op.parameters) {
      const req = p.required ? 'yes' : 'no'
      const type = escapeMarkdown(describeSchema(p.schema))
      const desc = escapeMarkdown(firstLine(p.description) || (p.deprecated ? '_deprecated_' : ''))
      lines.push(`| \`${p.name}\` | ${p.in} | ${req} | ${type} | ${desc} |`)
    }
    lines.push('')
  }

  if (op.requestBody) {
    lines.push(`${sub} Request body`)
    lines.push('')
    if (op.requestBody.description) {
      lines.push(op.requestBody.description)
      lines.push('')
    }
    const content = op.requestBody.content
    const mediaTypes = Object.keys(content)
    if (mediaTypes.length > 0) {
      lines.push(`Required: ${op.requestBody.required ? 'yes' : 'no'}`)
      lines.push('')
      for (const mt of mediaTypes) {
        lines.push(`\`${mt}\``)
        lines.push('')
        lines.push(renderSchemaBlock(content[mt]!.schema))
        lines.push('')
      }
    }
  }

  if (Object.keys(op.responses).length > 0) {
    lines.push(`${sub} Responses`)
    lines.push('')
    lines.push('| Status | Description | Media type | Type |')
    lines.push('|--------|-------------|------------|------|')
    for (const [code, resp] of Object.entries(op.responses)) {
      lines.push(renderResponseRow(code, resp))
    }
    lines.push('')
  }

  if (op.security.length > 0) {
    lines.push(`${sub} Security`)
    lines.push('')
    const parts = op.security
      .map((req) => Object.keys(req).map((s) => `\`${s}\``).join(' + '))
      .filter((s) => s.length > 0)
    if (parts.length > 0) {
      lines.push(parts.join(' _OR_ '))
      lines.push('')
    }
  }

  if (opts.includeExamples) {
    lines.push(`${sub} Example`)
    lines.push('')
    lines.push('```bash')
    lines.push(buildCurlExample(op, { baseUrl: opts.baseUrl, securitySchemes: opts.securitySchemes }))
    lines.push('```')
    lines.push('')
  }

  if (op.externalDocs) {
    const label = op.externalDocs.description ?? 'External docs'
    lines.push(`See also: [${label}](${op.externalDocs.url})`)
    lines.push('')
  }

  return lines.join('\n')
}

function renderResponseRow(code: string, resp: ParsedResponse): string {
  const description = escapeMarkdown(firstLine(resp.description))
  const mediaType = resp.mediaType ?? ''
  const type = resp.schema ? escapeMarkdown(describeSchema(resp.schema)) : ''
  return `| \`${code}\` | ${description} | \`${mediaType}\` | ${type} |`
}
