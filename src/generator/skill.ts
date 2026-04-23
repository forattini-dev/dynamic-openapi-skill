import { createHash } from 'node:crypto'
import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import { resolveSpec, filterOperations } from 'dynamic-openapi-tools/parser'
import type { ParsedOperation, ParsedSpec } from 'dynamic-openapi-tools/parser'
import { loadSpecWithSource } from '../loader.js'
import { renderOperation } from './operation.js'
import { firstLine, slugify, toTitleCase } from './naming.js'
import { buildDescription, extractIntent, type Intent } from './intent.js'
import { detectPatterns, renderErrorHint, renderPaginationHint } from './patterns.js'
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
  const tagSlugs = resolveTagSlugs(grouped)

  const files: SkillFile[] = []
  files.push({
    path: 'SKILL.md',
    content: renderSkillMd({ name, description, spec, baseUrl, grouped, split, includeExamples, metadata, intent, tagSlugs }),
  })

  if (split) {
    for (const [tag, ops] of grouped) {
      const slug = tagSlugs.get(tag)!
      files.push({
        path: `references/${slug}.md`,
        content: renderReferenceFile(tag, ops, intent, {
          skillName: name,
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

function resolveTagSlugs(grouped: Map<string, ParsedOperation[]>): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const tag of grouped.keys()) {
    const base = slugify(tag) || 'tag'
    let slug = base
    let n = 2
    while (used.has(slug)) slug = `${base}-${n++}`
    used.add(slug)
    out.set(tag, slug)
  }
  return out
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
  tagSlugs: Map<string, string>
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
    lines.push('_No servers declared. Ask the user for the base URL before making requests._')
  }
  lines.push('')

  lines.push('## Authentication')
  lines.push('')
  lines.push(renderAuthSection(ctx.spec.securitySchemes))
  lines.push('')

  lines.push('## Operations')
  lines.push('')
  lines.push(renderOperationsLead(ctx.spec, ctx.split))
  lines.push('')

  for (const [tag, ops] of ctx.grouped) {
    const slug = ctx.tagSlugs.get(tag)!
    lines.push(renderTagHeader(tag, ops, ctx.split, slug))
    lines.push('')
    lines.push(renderTagSummary(ops, ctx.intent))
    const flow = suggestFlow(ops, ctx.intent)
    if (flow) {
      lines.push('')
      lines.push(`Flow: ${flow}`)
    }
    lines.push('')
    if (!ctx.split) {
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
    lines.push('## References')
    lines.push('')
    lines.push(`- [${label}](${ctx.spec.externalDocs.url})`)
    lines.push('')
  }

  lines.push(renderMetadataSection(ctx.metadata))

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function renderOperationsLead(spec: ParsedSpec, split: boolean): string {
  const parts: string[] = []
  parts.push('Call via `Bash` + `curl`. Each op below ships a runnable template — replace placeholders and run.')
  if (spec.operations.some(hasBinaryResponse)) {
    parts.push('Binary responses: pass `-o <file>` to `curl` so bytes stream to disk, not context.')
  }
  const patterns = detectPatterns(spec)
  if (patterns.pagination) parts.push(renderPaginationHint(patterns.pagination))
  if (patterns.error) parts.push(renderErrorHint(patterns.error))
  if (spec.externalDocs) {
    parts.push('Use `WebFetch` only for the URL under [References](#references).')
  }
  if (split) {
    parts.push('Detailed ops are in `references/<tag>.md` — open only the file matching the user\'s tag.')
  }
  return parts.map((p) => `> ${p}`).join('\n')
}

function renderTagHeader(tag: string, ops: ParsedOperation[], split: boolean, slug: string): string {
  const title = `### ${toTitleCase(tag)} (${ops.length})`
  if (!split) return title
  const ref = `references/${slug}.md`
  return `${title} — [\`${ref}\`](${ref})`
}

function renderTagSummary(ops: ParsedOperation[], intent: Intent): string {
  const lines: string[] = []
  lines.push('| Verb | Operation | Method + path | Body |')
  lines.push('|------|-----------|---------------|------|')
  const sorted = [...ops].sort(
    (a, b) => workflowOrder(intent.verbsByOperation.get(a.operationId)) - workflowOrder(intent.verbsByOperation.get(b.operationId))
  )
  for (const op of sorted) {
    const verb = intent.verbsByOperation.get(op.operationId) ?? op.method.toLowerCase()
    const body = op.requestBody ? 'yes' : '—'
    lines.push(`| ${verb} | \`${op.operationId}\` | \`${op.method} ${op.path}\` | ${body} |`)
  }
  return lines.join('\n')
}

const WORKFLOW_VERB_ORDER = [
  'list', 'search', 'find', 'query',
  'get', 'fetch', 'retrieve', 'read',
  'create', 'add', 'register', 'upload',
  'update', 'patch', 'edit', 'modify', 'replace', 'set',
  'approve', 'reject', 'enable', 'disable', 'reset',
  'capture', 'refund', 'void', 'transfer', 'pay', 'charge',
  'send', 'notify', 'trigger', 'run', 'execute', 'start', 'stop', 'pause', 'resume',
  'download', 'export', 'import',
  'delete', 'remove', 'destroy', 'cancel',
]

function workflowOrder(verb: string | undefined): number {
  if (!verb) return WORKFLOW_VERB_ORDER.length
  const idx = WORKFLOW_VERB_ORDER.indexOf(verb)
  return idx === -1 ? WORKFLOW_VERB_ORDER.length : idx
}

function suggestFlow(ops: ParsedOperation[], intent: Intent): string {
  const byVerb = new Map<string, ParsedOperation>()
  for (const op of ops) {
    const verb = intent.verbsByOperation.get(op.operationId)
    if (verb && !byVerb.has(verb)) byVerb.set(verb, op)
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const op = byVerb.get(k)
      if (op) return op
    }
    return undefined
  }
  const create = pick('create', 'add', 'register')
  const read = pick('list', 'search', 'find', 'get', 'fetch')
  const update = pick('update', 'patch', 'edit', 'replace')
  const del = pick('delete', 'remove', 'cancel')

  const steps: string[] = []
  if (create) steps.push(`\`${create.operationId}\``)
  if (read) steps.push(`\`${read.operationId}\``)
  if (update) steps.push(`\`${update.operationId}\``)
  if (del) steps.push(`\`${del.operationId}\``)
  return steps.length >= 2 ? steps.join(' → ') : ''
}

function hasBinaryResponse(op: ParsedOperation): boolean {
  for (const resp of Object.values(op.responses)) {
    for (const mt of Object.keys(resp.content ?? {})) {
      if (mt.startsWith('image/')) return true
      if (mt === 'application/octet-stream') return true
      if (mt.startsWith('application/pdf')) return true
      if (mt === 'application/zip' || mt === 'application/x-gzip') return true
    }
  }
  return false
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

function renderReferenceFile(
  tag: string,
  operations: ParsedOperation[],
  intent: Intent,
  opts: { skillName: string; baseUrl: string; securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>; includeExamples: boolean; headingLevel: number }
): string {
  const lines: string[] = []
  lines.push(`# ${toTitleCase(tag)}`)
  lines.push('')
  lines.push(`_Part of the \`${opts.skillName}\` skill — see [\`../SKILL.md\`](../SKILL.md) for auth, base URL, and other tags._`)
  lines.push('')
  lines.push(renderTagSummary(operations, intent))
  const flow = suggestFlow(operations, intent)
  if (flow) {
    lines.push('')
    lines.push(`Flow: ${flow}`)
  }
  lines.push('')
  for (const op of operations) {
    lines.push(renderOperation(op, opts))
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function renderAuthSection(schemes: Record<string, OpenAPIV3.SecuritySchemeObject>): string {
  const entries = Object.entries(schemes)
  if (entries.length === 0) return '_No auth schemes declared. Operations are public or need out-of-band credentials._'

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

  lines.push('Ask the user for credentials if none are available in the environment.')
  return lines.join('\n')
}

function yamlString(text: string): string {
  if (/[:#\n"'`]/.test(text) || text.length > 160) {
    return JSON.stringify(text)
  }
  return text
}
