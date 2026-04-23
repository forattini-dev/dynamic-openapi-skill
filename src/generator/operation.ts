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
  const lines: string[] = []

  lines.push(`${h} \`${op.operationId}\``)
  lines.push('')

  const deprecated = op.deprecated ? ' — _deprecated_' : ''
  const summary = firstLine(op.summary ?? op.description)
  const header = summary
    ? `**\`${op.method} ${op.path}\`** — ${summary}${deprecated}`
    : `**\`${op.method} ${op.path}\`**${deprecated}`
  lines.push(header)
  lines.push('')

  if (op.description && op.description !== op.summary && op.description.trim().length > summary.length) {
    lines.push(op.description.trim())
    lines.push('')
  }

  if (op.parameters.length > 0) {
    lines.push('**Parameters**')
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
    const required = op.requestBody.required ? 'required' : 'optional'
    const mediaTypes = Object.keys(op.requestBody.content)
    const mt = mediaTypes[0] ?? 'application/json'
    const headerLine = op.requestBody.description
      ? `**Request body** (${required}, \`${mt}\`) — ${firstLine(op.requestBody.description)}`
      : `**Request body** (${required}, \`${mt}\`)`
    lines.push(headerLine)
    lines.push('')
    for (const m of mediaTypes) {
      if (mediaTypes.length > 1) {
        lines.push(`\`${m}\``)
        lines.push('')
      }
      lines.push(renderSchemaBlock(op.requestBody.content[m]!.schema))
      lines.push('')
    }
  }

  const responseEntries = Object.entries(op.responses)
  if (responseEntries.length === 1) {
    const [code, resp] = responseEntries[0]!
    lines.push(`**Response** — ${renderResponseInline(code, resp)}`)
    lines.push('')
  } else if (responseEntries.length > 1) {
    lines.push('**Responses**')
    lines.push('')
    lines.push('| Status | Description | Media type | Type |')
    lines.push('|--------|-------------|------------|------|')
    for (const [code, resp] of responseEntries) {
      lines.push(renderResponseRow(code, resp))
    }
    lines.push('')
  }

  const securityLine = formatSecurity(op.security)
  if (opts.includeExamples) {
    const suffix = securityLine ? ` — Auth: ${securityLine}` : ''
    lines.push(`**Example**${suffix}`)
    lines.push('')
    lines.push('```bash')
    lines.push(buildCurlExample(op, { baseUrl: opts.baseUrl, securitySchemes: opts.securitySchemes }))
    lines.push('```')
    lines.push('')
  } else if (securityLine) {
    lines.push(`_Auth: ${securityLine}_`)
    lines.push('')
  }

  if (op.externalDocs) {
    const label = op.externalDocs.description ?? 'External docs'
    lines.push(`See also: [${label}](${op.externalDocs.url})`)
    lines.push('')
  }

  return lines.join('\n')
}

function formatSecurity(security: ParsedOperation['security']): string {
  const parts = security
    .map((req) => Object.keys(req).map((s) => `\`${s}\``).join(' + '))
    .filter((s) => s.length > 0)
  return parts.join(' _OR_ ')
}

function renderResponseInline(code: string, resp: ParsedResponse): string {
  const description = firstLine(resp.description)
  const mediaType = resp.mediaType
  const type = resp.schema ? describeSchema(resp.schema) : ''
  const typePart = mediaType && type ? ` (\`${mediaType}\` — ${type})` : mediaType ? ` (\`${mediaType}\`)` : ''
  return description ? `\`${code}\` ${description}${typePart}` : `\`${code}\`${typePart}`
}

function renderResponseRow(code: string, resp: ParsedResponse): string {
  const description = escapeMarkdown(firstLine(resp.description))
  const mediaType = resp.mediaType ?? ''
  const type = resp.schema ? escapeMarkdown(describeSchema(resp.schema)) : ''
  return `| \`${code}\` | ${description} | \`${mediaType}\` | ${type} |`
}
