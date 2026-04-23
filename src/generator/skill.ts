import { createHash } from 'node:crypto'
import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import { resolveSpec, filterOperations } from 'dynamic-openapi-tools/parser'
import type { ParsedOperation, ParsedSpec } from 'dynamic-openapi-tools/parser'
import { loadSpecWithSource } from '../loader.js'
import { renderOperation } from './operation.js'
import { firstLine, slugify, toTitleCase } from './naming.js'
import { buildDescription, extractIntent, type Intent } from './intent.js'
import type { GeneratedSkill, GenerateSkillOptions, SkillFile, SpecMetadata } from './types.js'
import { GENERATOR_VERSION } from '../version.js'

const DEFAULT_SPLIT_THRESHOLD = 20

export async function generateSkill(options: GenerateSkillOptions): Promise<GeneratedSkill> {
  const loaded = await loadSpecWithSource(options.source)
  const spec = await resolveSpec(loaded.doc)
  spec.operations = filterOperations(spec.operations, options.filters)

  const intent = extractIntent(spec)

  const name = options.name ?? (slugify(spec.title) || 'openapi-skill')
  const description = options.description ?? buildDescription({
    title: spec.title,
    specDescription: spec.description,
    intent,
  })
  const baseUrl = resolveBaseUrl(spec, options.baseUrl, options.serverIndex)
  const splitThreshold = options.splitThreshold ?? DEFAULT_SPLIT_THRESHOLD
  const includeExamples = options.includeExamples ?? true

  const metadata: SpecMetadata = {
    apiVersion: spec.version,
    source: loaded.sourceLabel,
    md5: createHash('md5').update(loaded.text).digest('hex'),
    generatorVersion: GENERATOR_VERSION,
  }

  const grouped = groupByTag(spec.operations)
  const split = spec.operations.length > splitThreshold

  const files: SkillFile[] = []
  files.push({
    path: 'SKILL.md',
    content: renderSkillMd({ name, description, spec, baseUrl, grouped, split, includeExamples, metadata, intent }),
  })

  if (split) {
    for (const [tag, ops] of grouped) {
      files.push({
        path: `references/${slugify(tag)}.md`,
        content: renderReferenceFile(tag, ops, {
          baseUrl,
          securitySchemes: spec.securitySchemes,
          includeExamples,
          headingLevel: 2,
        }),
      })
    }
  }

  return { name, description, spec, files, metadata }
}

function resolveBaseUrl(spec: ParsedSpec, override: string | undefined, serverIndex = 0): string {
  if (override) return override
  const server = spec.servers[serverIndex] ?? spec.servers[0]
  if (!server) return ''
  let url = server.url
  if (server.variables) {
    for (const [name, variable] of Object.entries(server.variables)) {
      url = url.replace(`{${name}}`, variable.default)
    }
  }
  return url
}

function groupByTag(operations: ParsedOperation[]): Map<string, ParsedOperation[]> {
  const map = new Map<string, ParsedOperation[]>()
  for (const op of operations) {
    const tag = op.tags[0] ?? 'default'
    if (!map.has(tag)) map.set(tag, [])
    map.get(tag)!.push(op)
  }
  return map
}

interface RenderSkillContext {
  name: string
  description: string
  spec: ParsedSpec
  baseUrl: string
  grouped: Map<string, ParsedOperation[]>
  split: boolean
  includeExamples: boolean
  metadata: SpecMetadata
  intent: Intent
}

function renderSkillMd(ctx: RenderSkillContext): string {
  const lines: string[] = []
  lines.push('---')
  lines.push(`name: ${ctx.name}`)
  lines.push(`description: ${yamlString(ctx.description)}`)
  lines.push(`allowed-tools: Bash(curl *) WebFetch Read Write`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${ctx.spec.title}`)
  lines.push('')

  if (ctx.spec.description) {
    lines.push(ctx.spec.description.trim())
    lines.push('')
  }

  lines.push('## Base URL')
  lines.push('')
  if (ctx.spec.servers.length > 0) {
    lines.push('| URL | Description |')
    lines.push('|-----|-------------|')
    for (const s of ctx.spec.servers) {
      const desc = s.description ? firstLine(s.description) : ''
      lines.push(`| \`${s.url}\` | ${desc} |`)
    }
    lines.push('')
    lines.push(`Default: \`${ctx.baseUrl}\``)
  } else {
    lines.push('_No servers declared in the spec. Ask the user for the base URL before making requests._')
  }
  lines.push('')

  lines.push('## Authentication')
  lines.push('')
  lines.push(renderAuthSection(ctx.spec.securitySchemes))
  lines.push('')

  if (ctx.spec.tags.length > 0) {
    lines.push('## Tags')
    lines.push('')
    for (const t of ctx.spec.tags) {
      const desc = t.description ? ` — ${firstLine(t.description)}` : ''
      lines.push(`- **${t.name}**${desc}`)
    }
    lines.push('')
  }

  if (ctx.split) {
    lines.push('## Operations')
    lines.push('')
    lines.push('Operations are grouped by tag. Load the matching reference file when the user asks about a specific area:')
    lines.push('')
    for (const [tag, ops] of ctx.grouped) {
      const file = `references/${slugify(tag)}.md`
      lines.push(`- [${toTitleCase(tag)}](${file}) — ${ops.length} operation${ops.length === 1 ? '' : 's'}`)
    }
    lines.push('')
    lines.push('Full operation list:')
    lines.push('')
    lines.push(renderOperationIndex(ctx.grouped))
  } else {
    lines.push('## Operations')
    lines.push('')
    for (const [tag, ops] of ctx.grouped) {
      lines.push(`### ${toTitleCase(tag)}`)
      lines.push('')
      for (const op of ops) {
        lines.push(
          renderOperation(op, {
            baseUrl: ctx.baseUrl,
            securitySchemes: ctx.spec.securitySchemes,
            includeExamples: ctx.includeExamples,
            headingLevel: 4,
          })
        )
      }
    }
  }

  if (ctx.spec.externalDocs) {
    const label = ctx.spec.externalDocs.description ?? 'External documentation'
    lines.push(`## References`)
    lines.push('')
    lines.push(`- [${label}](${ctx.spec.externalDocs.url})`)
    lines.push('')
  }

  lines.push(renderMetadataSection(ctx.metadata))

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function renderMetadataSection(metadata: SpecMetadata): string {
  const lines: string[] = []
  lines.push('## Spec metadata')
  lines.push('')
  lines.push('<!-- dynamic-openapi-skill: do not edit by hand — regenerate from the spec -->')
  lines.push('')
  lines.push(`- API version: \`${metadata.apiVersion}\``)
  lines.push(`- Source: \`${metadata.source}\``)
  lines.push(`- Spec MD5: \`${metadata.md5}\``)
  lines.push(`- Generated by \`dynamic-openapi-skill@${metadata.generatorVersion}\``)
  lines.push('')
  return lines.join('\n')
}

function renderOperationIndex(grouped: Map<string, ParsedOperation[]>): string {
  const lines: string[] = []
  lines.push('| Operation | Method | Path | Summary |')
  lines.push('|-----------|--------|------|---------|')
  for (const ops of grouped.values()) {
    for (const op of ops) {
      const summary = firstLine(op.summary ?? op.description).replace(/\|/g, '\\|')
      lines.push(`| \`${op.operationId}\` | ${op.method} | \`${op.path}\` | ${summary} |`)
    }
  }
  return lines.join('\n')
}

function renderReferenceFile(
  tag: string,
  operations: ParsedOperation[],
  opts: { baseUrl: string; securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>; includeExamples: boolean; headingLevel: number }
): string {
  const lines: string[] = []
  lines.push(`# ${toTitleCase(tag)}`)
  lines.push('')
  lines.push(`${operations.length} operation${operations.length === 1 ? '' : 's'} in this group.`)
  lines.push('')
  for (const op of operations) {
    lines.push(renderOperation(op, opts))
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function renderAuthSection(schemes: Record<string, OpenAPIV3.SecuritySchemeObject>): string {
  const entries = Object.entries(schemes)
  if (entries.length === 0) return '_No authentication schemes declared. Operations are either public or require out-of-band credentials._'

  const lines: string[] = []
  for (const [name, scheme] of entries) {
    lines.push(`### \`${name}\``)
    lines.push('')
    if (scheme.type === 'http') {
      lines.push(`- Type: HTTP ${scheme.scheme}`)
      if (scheme.bearerFormat) lines.push(`- Bearer format: \`${scheme.bearerFormat}\``)
      if (scheme.scheme === 'bearer') {
        lines.push('- Send: `Authorization: Bearer <token>`')
      } else if (scheme.scheme === 'basic') {
        lines.push('- Send: `Authorization: Basic base64(user:password)`')
      }
    } else if (scheme.type === 'apiKey') {
      lines.push(`- Type: API key`)
      lines.push(`- Location: ${scheme.in}`)
      lines.push(`- Name: \`${scheme.name}\``)
    } else if (scheme.type === 'oauth2') {
      lines.push('- Type: OAuth 2.0')
      const flows = scheme.flows ?? {}
      for (const [flowName, rawFlow] of Object.entries(flows)) {
        if (!rawFlow) continue
        const f = rawFlow as {
          tokenUrl?: string
          authorizationUrl?: string
          refreshUrl?: string
          scopes?: Record<string, string>
        }
        lines.push(`- Flow \`${flowName}\`:`)
        if (f.tokenUrl) lines.push(`  - Token URL: ${f.tokenUrl}`)
        if (f.authorizationUrl) lines.push(`  - Authorization URL: ${f.authorizationUrl}`)
        if (f.refreshUrl) lines.push(`  - Refresh URL: ${f.refreshUrl}`)
        if (f.scopes && Object.keys(f.scopes).length > 0) {
          lines.push(`  - Scopes:`)
          for (const [scope, desc] of Object.entries(f.scopes)) {
            lines.push(`    - \`${scope}\`${desc ? ` — ${desc}` : ''}`)
          }
        }
      }
    } else if (scheme.type === 'openIdConnect') {
      lines.push('- Type: OpenID Connect')
      lines.push(`- Discovery URL: ${scheme.openIdConnectUrl}`)
    }
    if (scheme.description) {
      lines.push('')
      lines.push(scheme.description.trim())
    }
    lines.push('')
  }

  lines.push('Ask the user for credentials if they are not already available in the environment.')
  return lines.join('\n')
}

function yamlString(text: string): string {
  if (/[:#\n"'`]/.test(text) || text.length > 160) {
    return JSON.stringify(text)
  }
  return text
}
