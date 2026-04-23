import type { ParsedOperation, ParsedSpec } from 'dynamic-openapi-tools/parser'

export interface Intent {
  verbs: string[]
  nouns: string[]
  verbsByOperation: Map<string, string>
  nounsByOperation: Map<string, string>
}

const VERB_PREFIXES = [
  'list', 'get', 'fetch', 'find', 'search', 'query', 'retrieve', 'read',
  'create', 'add', 'register', 'upload',
  'update', 'patch', 'edit', 'modify', 'replace', 'set',
  'delete', 'remove', 'destroy', 'cancel',
  'approve', 'reject', 'enable', 'disable', 'reset',
  'refund', 'void', 'capture', 'transfer', 'pay', 'charge',
  'download', 'export', 'import',
  'send', 'notify', 'trigger', 'run', 'execute', 'start', 'stop', 'pause', 'resume',
]

export function extractIntent(spec: ParsedSpec): Intent {
  const verbsByOperation = new Map<string, string>()
  const nounsByOperation = new Map<string, string>()
  const verbCounts = new Map<string, number>()
  const nounCounts = new Map<string, number>()

  for (const op of spec.operations) {
    const verb = extractVerbFromOperation(op)
    const noun = extractNounFromOperation(op)
    verbsByOperation.set(op.operationId, verb)
    nounsByOperation.set(op.operationId, noun)
    verbCounts.set(verb, (verbCounts.get(verb) ?? 0) + 1)
    if (noun) nounCounts.set(noun, (nounCounts.get(noun) ?? 0) + 1)
  }

  const verbs = Array.from(verbCounts.entries())
    .sort((a, b) => b[1] - a[1] || verbPriority(a[0]) - verbPriority(b[0]) || a[0].localeCompare(b[0]))
    .map(([v]) => v)

  const nouns = Array.from(nounCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n]) => n)

  return { verbs, nouns, verbsByOperation, nounsByOperation }
}

const VERB_ORDER = [
  'list', 'search', 'find', 'query',
  'get', 'fetch', 'retrieve', 'read',
  'create', 'add', 'register',
  'update', 'patch', 'edit', 'modify', 'replace', 'set',
  'upload', 'download',
  'approve', 'reject', 'enable', 'disable', 'reset',
  'capture', 'refund', 'void', 'transfer', 'pay', 'charge',
  'send', 'notify', 'trigger', 'run', 'execute', 'start', 'stop', 'pause', 'resume',
  'export', 'import',
  'delete', 'remove', 'destroy', 'cancel',
]

function verbPriority(verb: string): number {
  const idx = VERB_ORDER.indexOf(verb)
  return idx === -1 ? VERB_ORDER.length : idx
}

export function extractVerbFromOperation(op: ParsedOperation): string {
  const id = op.operationId
  if (id) {
    const lower = id.toLowerCase()
    for (const verb of VERB_PREFIXES) {
      if (!lower.startsWith(verb)) continue
      if (lower.length === verb.length) return verb
      const next = id.charAt(verb.length)
      if (next === '_' || next === '-' || /[A-Z]/.test(next)) return verb
    }
  }
  return verbFromMethodAndPath(op.method, op.path)
}

function verbFromMethodAndPath(method: string, path: string): string {
  const endsWithParam = /\{[^}]+\}\/?$/.test(path)
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return endsWithParam ? 'get' : 'list'
    case 'POST':
      return 'create'
    case 'PUT':
      return 'replace'
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return method.toLowerCase()
  }
}

export function extractNounFromOperation(op: ParsedOperation): string {
  if (op.tags[0]) return singularize(op.tags[0].toLowerCase())
  const segments = op.path.split('/').filter((s) => s && !s.startsWith('{'))
  const last = segments[segments.length - 1] ?? ''
  return singularize(last.toLowerCase())
}

export function singularize(word: string): string {
  if (!word) return word
  if (word.endsWith('ies') && word.length > 3) return word.slice(0, -3) + 'y'
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2)
  if (word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 2) {
    return word.slice(0, -1)
  }
  return word
}

export function pluralize(word: string): string {
  if (!word) return word
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) return word + 'es'
  if (word.endsWith('y') && word.length > 1 && !'aeiou'.includes(word[word.length - 2]!)) {
    return word.slice(0, -1) + 'ies'
  }
  return word + 's'
}

export function joinList(items: string[], conjunction = 'and'): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

export interface DescriptionOptions {
  title: string
  specDescription?: string
  intent: Intent
  limit?: number
}

export function buildDescription(opts: DescriptionOptions): string {
  const limit = opts.limit ?? 1024
  const intent = opts.intent

  const topVerbs = intent.verbs.slice(0, 5)
  const topNouns = intent.nouns.slice(0, 4)

  const verbPhrase = topVerbs.length > 0 ? joinList(topVerbs) : 'interact with'
  const nounPhrase = topNouns.length > 0 ? joinList(topNouns.map(pluralize)) : opts.title.toLowerCase()

  const lead = capitalize(`${verbPhrase} ${nounPhrase} via the ${opts.title} API.`)

  const triggers = buildTriggerPhrases(topVerbs, topNouns)
  const triggerSentence = triggers.length > 0
    ? ` Use when the user ${joinList(triggers, 'or')}.`
    : ` Use when the user wants to work with ${nounPhrase}.`

  let combined = `${lead}${triggerSentence}`

  if (opts.specDescription) {
    const extra = ` ${firstSentence(opts.specDescription)}`
    if (combined.length + extra.length <= limit) combined += extra
  }

  if (combined.length > limit) {
    combined = combined.slice(0, limit - 1).trimEnd() + '…'
  }
  return combined
}

function buildTriggerPhrases(verbs: string[], nouns: string[]): string[] {
  const triggers: string[] = []
  const primaryNoun = nouns[0]
  if (!primaryNoun) return triggers

  const verbTemplates: Record<string, (noun: string) => string> = {
    list: (n) => `asks to list ${pluralize(n)}`,
    get: (n) => `wants to fetch a ${n} by id`,
    fetch: (n) => `wants to fetch ${pluralize(n)}`,
    find: (n) => `wants to find ${pluralize(n)}`,
    search: (n) => `asks to search ${pluralize(n)}`,
    create: (n) => `wants to create a new ${n}`,
    add: (n) => `wants to add a ${n}`,
    update: (n) => `asks to update a ${n}`,
    patch: (n) => `asks to update a ${n}`,
    edit: (n) => `wants to edit a ${n}`,
    replace: (n) => `wants to replace a ${n}`,
    delete: (n) => `asks to delete a ${n}`,
    remove: (n) => `asks to remove a ${n}`,
    cancel: (n) => `asks to cancel a ${n}`,
    upload: (n) => `uploads a ${n}`,
    download: (n) => `downloads a ${n}`,
    refund: (n) => `asks for a refund`,
    approve: (n) => `approves a ${n}`,
    reject: (n) => `rejects a ${n}`,
  }

  for (const verb of verbs.slice(0, 3)) {
    const tmpl = verbTemplates[verb]
    if (tmpl) triggers.push(tmpl(primaryNoun))
  }

  if (nouns.length > 1) {
    triggers.push(`mentions ${joinList(nouns.slice(0, 3).map(pluralize))}`)
  }

  return triggers
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?\n]+[.!?]/)
  return (match?.[0] ?? text.split('\n')[0] ?? '').trim()
}

function capitalize(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}
